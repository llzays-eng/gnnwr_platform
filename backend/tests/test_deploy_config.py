"""P1-6：compose 不暴露数据服务端口、口令无默认值；连接串正确转义口令；默认口令告警。"""
from __future__ import annotations

import logging
import re
from pathlib import Path

import pytest
yaml = pytest.importorskip("yaml")

from app.core import startup
from app.core.config import Settings

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "docker-compose.yml"


@pytest.fixture(scope="module")
def compose_text() -> str:
    if not COMPOSE.exists():
        pytest.skip("docker-compose.yml 不在仓库根目录")
    return COMPOSE.read_text(encoding="utf-8")


@pytest.mark.parametrize("svc", ["postgis", "redis", "minio"])
def test_data_services_not_published(compose_text, svc):
    services = yaml.safe_load(compose_text)["services"]
    assert "ports" not in services[svc], f"{svc} 不应映射宿主机端口"


@pytest.mark.parametrize("var", [
    "SECRET_KEY", "POSTGRES_PASSWORD", "REDIS_PASSWORD", "MINIO_ACCESS_KEY", "MINIO_SECRET_KEY",
])
def test_secrets_have_no_default(compose_text, var):
    uses = re.findall(r"\$\{" + var + r"([:?-][^}]*)\}", compose_text)
    assert uses, f"{var} 未在 compose 中使用"
    for u in uses:
        assert u.startswith(":?"), f"{var} 不应有默认值：${{{var}{u}}}"


def test_redis_requires_password(compose_text):
    redis = yaml.safe_load(compose_text)["services"]["redis"]
    assert "--requirepass" in " ".join(redis["command"])


def test_minio_image_pinned(compose_text):
    image = yaml.safe_load(compose_text)["services"]["minio"]["image"]
    assert not image.endswith(":latest") and (":" in image or "@sha256:" in image)


def test_dev_override_binds_loopback_only():
    dev = ROOT / "docker-compose.dev.yml"
    if not dev.exists():
        pytest.skip("无 dev 覆盖文件")
    for svc in yaml.safe_load(dev.read_text(encoding="utf-8"))["services"].values():
        for p in svc.get("ports", []):
            assert p.startswith("127.0.0.1:"), p


def test_redis_uri_quotes_password():
    s = Settings(SECRET_KEY="x" * 40, REDIS_PASSWORD="p@s/s:w", REDIS_HOST="redis")
    assert s.redis_uri == "redis://:p%40s%2Fs%3Aw@redis:6379/0"


def test_redis_uri_without_password_unchanged():
    s = Settings(SECRET_KEY="x" * 40, REDIS_PASSWORD="", REDIS_HOST="h")
    assert s.redis_uri == "redis://h:6379/0"


def test_sqlalchemy_uri_quotes_password():
    from sqlalchemy.engine import make_url

    s = Settings(SECRET_KEY="x" * 40, POSTGRES_PASSWORD="a@b/c:d")
    assert make_url(s.sqlalchemy_uri).password == "a@b/c:d"


def test_weak_default_passwords_warn(monkeypatch, caplog):
    monkeypatch.setattr(startup, "settings", Settings(
        SECRET_KEY="x" * 40, DEBUG=False, POSTGRES_PASSWORD="gnnwr_pass", MINIO_SECRET_KEY="minioadmin",
    ))
    with caplog.at_level(logging.WARNING, logger="gnnwr.startup"):
        weak = startup.warn_weak_defaults()
    assert set(weak) == {"POSTGRES_PASSWORD", "MINIO_SECRET_KEY"}
    assert "默认口令" in caplog.text


def test_strong_passwords_no_warning(monkeypatch):
    monkeypatch.setattr(startup, "settings", Settings(
        SECRET_KEY="x" * 40, POSTGRES_PASSWORD="strong-1", MINIO_SECRET_KEY="strong-2",
    ))
    assert startup.warn_weak_defaults() == []
