"""启动安全检查：占位 SECRET_KEY 在非 DEBUG 下拒绝启动。"""
from __future__ import annotations

import logging

from app.core.config import settings
from app.core.secrets import is_placeholder_secret

log = logging.getLogger("gnnwr.startup")


class InsecureConfiguration(RuntimeError):
    pass


# 仓库里出现过的默认口令。已有数据卷的库改口令需要手动 ALTER USER，所以这里只告警不拒绝启动。
_WEAK_DEFAULTS = {
    "POSTGRES_PASSWORD": {"gnnwr_pass"},
    "MINIO_SECRET_KEY": {"minioadmin"},
}


def warn_weak_defaults() -> list[str]:
    weak = [k for k, bad in _WEAK_DEFAULTS.items() if getattr(settings, k, None) in bad]
    if weak and not settings.DEBUG:
        log.warning("*** 以下配置仍是仓库默认口令，生产请更换：%s ***", ", ".join(weak))
    return weak


def assert_secure_startup() -> None:
    warn_weak_defaults()
    if not is_placeholder_secret(settings.SECRET_KEY):
        return
    msg = (
        "SECRET_KEY 仍是占位符（CHANGE_ME…）。"
        "生产环境必须设置随机密钥（例如 openssl rand -hex 32）。"
    )
    if not settings.DEBUG:
        raise InsecureConfiguration(msg)
    log.warning("*** %s 当前 DEBUG=true，仅允许本地开发。***", msg)
