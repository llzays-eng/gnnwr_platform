"""Redis 连接小封装：进度频道、WS ticket、取消标记、任务日志、token 黑名单。"""
from __future__ import annotations

from functools import lru_cache

import redis

from app.core.config import settings


@lru_cache
def get_sync_redis() -> redis.Redis:
    return redis.from_url(settings.redis_uri, decode_responses=True)


def redis_available() -> bool:
    try:
        get_sync_redis().ping()
        return True
    except Exception:
        return False


def blacklist_jti(jti: str, ttl_seconds: int) -> None:
    if not jti or ttl_seconds <= 0:
        return
    try:
        get_sync_redis().setex(f"auth:deny:{jti}", ttl_seconds, "1")
    except Exception:
        pass


def is_jti_denied(jti: str | None) -> bool:
    if not jti:
        return False
    try:
        return bool(get_sync_redis().get(f"auth:deny:{jti}"))
    except Exception:
        return False


class RedisUnavailable(RuntimeError):
    """需要 Redis 才能保证语义（一次性 refresh、全局吊销）时，Redis 不可达。"""


def claim_refresh_jti(jti: str, ttl_seconds: int) -> bool:
    """原子地把 refresh jti 标记为已用（同时进黑名单）。

    返回 True 表示本次是第一次使用；False 表示已用过/已吊销（重放）。
    Redis 不可达时抛 RedisUnavailable——一次性语义无法保证，宁可拒绝换发（fail closed）。
    """
    try:
        ok = get_sync_redis().set(f"auth:deny:{jti}", "1", nx=True, ex=max(1, int(ttl_seconds)))
    except Exception as exc:  # noqa: BLE001
        raise RedisUnavailable(str(exc)) from exc
    return bool(ok)


def _gen_key(user_id: str) -> str:
    return f"auth:gen:{user_id}"


def get_user_token_gen(user_id: str | None) -> int:
    """用户当前令牌代数。令牌里 gen 小于它即视为已吊销。Redis 不可达时按 0 处理（与 jti 黑名单一致）。"""
    if not user_id:
        return 0
    try:
        v = get_sync_redis().get(_gen_key(str(user_id)))
        return int(v) if v else 0
    except Exception:
        return 0


def bump_user_token_gen(user_id: str) -> int:
    """吊销该用户此前签发的全部 access/refresh 令牌。Redis 不可达时抛 RedisUnavailable。"""
    try:
        return int(get_sync_redis().incr(_gen_key(str(user_id))))
    except Exception as exc:  # noqa: BLE001
        raise RedisUnavailable(str(exc)) from exc


def is_token_revoked(payload: dict) -> bool:
    """jti 已拉黑，或令牌代数落后于用户当前代数（logout-all 之后签发前的令牌）。"""
    if is_jti_denied(payload.get("jti")):
        return True
    try:
        tok_gen = int(payload.get("gen") or 0)
    except (TypeError, ValueError):
        return True
    return tok_gen < get_user_token_gen(payload.get("sub"))
