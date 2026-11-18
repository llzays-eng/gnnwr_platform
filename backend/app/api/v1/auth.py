"""认证：register / login（JSON + OAuth2 表单）/ me / refresh / logout / ws-ticket。"""
from __future__ import annotations

from datetime import datetime, timezone

import jwt
from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.redis_client import (
    RedisUnavailable, blacklist_jti, bump_user_token_gen, claim_refresh_jti,
    get_user_token_gen, is_token_revoked, redis_available,
)
from app.core.security import (
    Role, create_access_token, create_refresh_token, decode_token,
    hash_password, verify_password,
)
from app.models.user import User
from app.schemas.auth import (
    LoginResponse, LogoutRequest, RefreshRequest, UserCreate, UserProfile, WsTicketOut,
)
from app.services.serialize import login_response, user_profile
from app.services.tickets import TICKET_TTL_S, issue_ws_ticket

router = APIRouter(prefix="/auth", tags=["auth"])


async def _extract_credentials(request: Request) -> tuple[str, str]:
    ct = (request.headers.get("content-type") or "").lower()
    if "application/json" in ct:
        data = await request.json()
        username = data.get("username") or data.get("email")
        password = data.get("password")
        if not username or not password:
            raise HTTPException(status_code=422, detail="需要 username 与 password")
        return str(username), str(password)
    form = await request.form()
    username = form.get("username")
    password = form.get("password")
    if not username or not password:
        raise HTTPException(status_code=422, detail="需要 username 与 password")
    return str(username), str(password)


@router.post("/register", response_model=UserProfile, status_code=201)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    exists = db.scalar(select(User).where(
        or_(User.email == payload.email, User.username == payload.username)
    ))
    if exists:
        raise HTTPException(status_code=400, detail="邮箱或用户名已注册")
    user = User(
        email=payload.email,
        username=payload.username,
        display_name=payload.display_name or payload.username,
        hashed_password=hash_password(payload.password),
        role=Role.user.value,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_profile(user)


@router.post("/login", response_model=LoginResponse)
async def login(request: Request, db: Session = Depends(get_db)):
    username, password = await _extract_credentials(request)
    user = db.scalar(select(User).where(or_(User.email == username, User.username == username)))
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="邮箱或密码错误")
    return _issue_pair(user)


def _issue_pair(user: User) -> LoginResponse:
    gen = get_user_token_gen(user.id)
    access = create_access_token(subject=user.id, role=user.role, gen=gen)
    refresh_tok = create_refresh_token(subject=user.id, role=user.role, gen=gen)
    return login_response(user, access, refresh_tok)


def _remaining_ttl(payload: dict, default: int = 60) -> int:
    exp = payload.get("exp")
    if isinstance(exp, (int, float)):
        return max(1, int(exp - datetime.now(timezone.utc).timestamp()))
    return default


_BAD_REFRESH = HTTPException(status_code=401, detail="无效的 refresh_token")


@router.get("/me", response_model=UserProfile)
def me(user: User = Depends(get_current_user)):
    return user_profile(user)


@router.post("/refresh", response_model=LoginResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    """refresh token 一次性使用（rotation）：换发新的一对令牌，旧 refresh 立即作废，重放返回 401。"""
    try:
        data = decode_token(payload.refresh_token)
    except jwt.PyJWTError:
        raise _BAD_REFRESH
    # P1-4：传入 access/tile 等非 refresh 令牌应是 401，而不是未捕获异常导致的 500
    if data.get("typ") != "refresh" or not data.get("sub") or not data.get("jti"):
        raise _BAD_REFRESH
    # P1-5：已登出 / logout-all 之后的 refresh 不能再换发
    if is_token_revoked(data):
        raise _BAD_REFRESH
    user = db.get(User, data.get("sub"))
    if user is None:
        raise HTTPException(status_code=401, detail="用户不存在")
    try:
        first_use = claim_refresh_jti(data["jti"], _remaining_ttl(data))
    except RedisUnavailable:
        raise HTTPException(status_code=503, detail="Redis 不可用，暂时无法刷新令牌，请重新登录")
    if not first_use:
        raise _BAD_REFRESH
    return _issue_pair(user)


@router.post("/logout", status_code=204)
def logout(
    request: Request,
    body: LogoutRequest | None = Body(default=None),
    user: User = Depends(get_current_user),
):
    """拉黑当前 access；若请求体带 refresh_token（且属于当前用户），一并拉黑。"""
    auth = request.headers.get("authorization") or ""
    token = auth.split(" ", 1)[-1] if auth else ""
    try:
        payload = decode_token(token)
        blacklist_jti(payload.get("jti"), _remaining_ttl(payload))
    except jwt.PyJWTError:
        pass
    if body is not None and body.refresh_token:
        try:
            rdata = decode_token(body.refresh_token)
        except jwt.PyJWTError:
            rdata = None
        # 只允许吊销自己的 refresh；别人的令牌静默忽略，不泄露是否有效
        if rdata and rdata.get("typ") == "refresh" and str(rdata.get("sub")) == str(user.id):
            blacklist_jti(rdata.get("jti"), _remaining_ttl(rdata))
    return None


@router.post("/logout-all", status_code=204)
def logout_all(request: Request, user: User = Depends(get_current_user)):
    """吊销该用户此前签发的全部 access/refresh（令牌泄露、改密后调用）。"""
    try:
        bump_user_token_gen(user.id)
    except RedisUnavailable:
        raise HTTPException(status_code=503, detail="Redis 不可用，无法吊销令牌")
    return None


@router.post("/ws-ticket", response_model=WsTicketOut)
def ws_ticket(task_id: str | None = None, user: User = Depends(get_current_user)):
    """一次性短票。可选绑定 task_id；连接成功后即失效（GETDEL）。"""
    if not redis_available():
        raise HTTPException(status_code=503, detail="Redis 不可用，请改用 WebSocket ?token=")
    ticket = issue_ws_ticket(user.id, task_id=task_id)
    return WsTicketOut(ticket=ticket, expires_in=TICKET_TTL_S)
