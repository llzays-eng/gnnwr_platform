"""P1-4 / P1-5：refresh 错误令牌返回 401；refresh 一次性使用；logout 可吊销 refresh；logout-all 全局吊销。"""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api.v1 import auth as auth_api
from app.core import redis_client
from app.core.database import get_db
from app.core.security import create_access_token, create_refresh_token
from app.main import app
from app.models.user import User
from app.services.signed_url import create_tile_token


class FakeRedis:
    """只实现鉴权用到的命令。"""

    def __init__(self):
        self.store: dict[str, str] = {}

    def get(self, k):
        return self.store.get(k)

    def set(self, k, v, nx=False, ex=None):
        if nx and k in self.store:
            return None
        self.store[k] = str(v)
        return True

    def setex(self, k, _ttl, v):
        self.store[k] = str(v)
        return True

    def incr(self, k):
        self.store[k] = str(int(self.store.get(k, 0)) + 1)
        return int(self.store[k])

    def ping(self):
        return True


class DownRedis:
    def __getattr__(self, _name):
        def boom(*_a, **_kw):
            raise ConnectionError("redis down")
        return boom


ALICE = SimpleNamespace(
    id="user-alice", username="alice", display_name="Alice", role="user",
    created_at=None, email="alice@example.com", hashed_password="x",
)
BOB = SimpleNamespace(
    id="user-bob", username="bob", display_name="Bob", role="user",
    created_at=None, email="bob@example.com", hashed_password="x",
)


class FakeDB:
    def __init__(self):
        self.users = {u.id: u for u in (ALICE, BOB)}

    def get(self, model, key):
        assert model is User
        return self.users.get(key)

    def scalar(self, _stmt):
        return ALICE

    def close(self):
        pass


@pytest.fixture
def fake_redis(monkeypatch):
    r = FakeRedis()
    monkeypatch.setattr(redis_client, "get_sync_redis", lambda: r)
    return r


@pytest.fixture
def client(fake_redis, monkeypatch):
    db = FakeDB()

    def override_db():
        yield db

    monkeypatch.setattr(auth_api, "verify_password", lambda raw, _h: raw == "pw-alice")
    app.dependency_overrides[get_db] = override_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _login(c: TestClient) -> dict:
    r = c.post("/api/v1/auth/login", json={"username": "alice", "password": "pw-alice"})
    assert r.status_code == 200, r.text
    return r.json()


def _me(c: TestClient, access: str) -> int:
    return c.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access}"}).status_code


# ---------------- P1-4 ----------------

def test_refresh_with_access_token_is_401_not_500(client):
    tokens = _login(client)
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["access_token"]})
    assert r.status_code == 401


def test_refresh_with_tile_token_is_401(client):
    r = client.post("/api/v1/auth/refresh",
                    json={"refresh_token": create_tile_token("user-alice", "task-1")})
    assert r.status_code == 401


def test_refresh_with_garbage_is_401(client):
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": "not-a-jwt"})
    assert r.status_code == 401


def test_refresh_for_deleted_user_is_401(client):
    tok = create_refresh_token(subject="user-gone", role="user")
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": tok}).status_code == 401


# ---------------- P1-5 rotation ----------------

def test_refresh_rotates_and_old_refresh_is_single_use(client):
    tokens = _login(client)
    r1 = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r1.status_code == 200
    new = r1.json()
    assert new["refresh_token"] != tokens["refresh_token"]
    assert _me(client, new["access_token"]) == 200
    # 旧 refresh 重放被拒
    r2 = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r2.status_code == 401
    # 新 refresh 仍可用
    r3 = client.post("/api/v1/auth/refresh", json={"refresh_token": new["refresh_token"]})
    assert r3.status_code == 200


def test_refresh_fails_closed_when_redis_down(client, monkeypatch):
    tokens = _login(client)
    monkeypatch.setattr(redis_client, "get_sync_redis", lambda: DownRedis())
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 503


# ---------------- P1-5 logout ----------------

def test_logout_without_body_still_works(client):
    tokens = _login(client)
    h = {"Authorization": f"Bearer {tokens['access_token']}"}
    assert client.post("/api/v1/auth/logout", headers=h).status_code == 204
    assert _me(client, tokens["access_token"]) == 401
    # 旧客户端不带 refresh_token：refresh 不受影响（与之前行为一致）
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200


def test_logout_with_refresh_revokes_it(client):
    tokens = _login(client)
    h = {"Authorization": f"Bearer {tokens['access_token']}"}
    r = client.post("/api/v1/auth/logout", headers=h,
                    json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 204
    assert _me(client, tokens["access_token"]) == 401
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 401


def test_logout_cannot_revoke_someone_elses_refresh(client):
    alice = _login(client)
    bob_refresh = create_refresh_token(subject=BOB.id, role="user")
    h = {"Authorization": f"Bearer {alice['access_token']}"}
    assert client.post("/api/v1/auth/logout", headers=h,
                       json={"refresh_token": bob_refresh}).status_code == 204
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": bob_refresh})
    assert r.status_code == 200


# ---------------- P1-5 logout-all ----------------

def test_logout_all_revokes_every_existing_token(client):
    a = _login(client)
    b = _login(client)  # 另一台设备
    h = {"Authorization": f"Bearer {a['access_token']}"}
    assert client.post("/api/v1/auth/logout-all", headers=h).status_code == 204
    for t in (a, b):
        assert _me(client, t["access_token"]) == 401
        r = client.post("/api/v1/auth/refresh", json={"refresh_token": t["refresh_token"]})
        assert r.status_code == 401
    # 之后重新登录正常
    c = _login(client)
    assert _me(client, c["access_token"]) == 200
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": c["refresh_token"]})
    assert r.status_code == 200


def test_logout_all_revokes_legacy_tokens_without_gen(client, fake_redis):
    legacy = create_access_token(subject=ALICE.id, role="user")  # gen=0
    assert _me(client, legacy) == 200
    fake_redis.incr("auth:gen:user-alice")
    assert _me(client, legacy) == 401


def test_logout_all_is_per_user(client):
    alice = _login(client)
    bob_access = create_access_token(subject=BOB.id, role="user")
    h = {"Authorization": f"Bearer {alice['access_token']}"}
    assert client.post("/api/v1/auth/logout-all", headers=h).status_code == 204
    assert _me(client, bob_access) == 200


def test_logout_all_503_when_redis_down(client, monkeypatch):
    alice = _login(client)
    monkeypatch.setattr(redis_client, "get_sync_redis", lambda: DownRedis())
    h = {"Authorization": f"Bearer {alice['access_token']}"}
    assert client.post("/api/v1/auth/logout-all", headers=h).status_code == 503


def test_ws_token_respects_logout_all(fake_redis):
    from app.core.redis_client import is_token_revoked
    from app.core.security import decode_token

    payload = decode_token(create_access_token(subject=ALICE.id, role="user"))
    assert is_token_revoked(payload) is False
    fake_redis.incr("auth:gen:user-alice")
    assert is_token_revoked(payload) is True


def test_non_integer_gen_claim_is_rejected(fake_redis):
    from app.core.redis_client import is_token_revoked

    assert is_token_revoked({"sub": "u", "jti": "j", "gen": "abc"}) is True
