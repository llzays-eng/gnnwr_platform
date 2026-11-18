"""全局配置：读取环境变量 / .env。"""
from __future__ import annotations

from functools import lru_cache
from urllib.parse import quote

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "GNNWR Platform API"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False
    PUBLIC_BASE_URL: str = "http://localhost:8000"

    SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION_please_use_openssl_rand_hex_32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14
    WS_REQUIRE_AUTH: bool = True
    TILE_TOKEN_EXPIRE_MINUTES: int = 60
    # 仅开发：Celery broker 不可用时在 API 进程内跑预处理/训练。生产必须 false。
    ALLOW_INLINE_JOBS: bool = False

    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "gnnwr"
    POSTGRES_PASSWORD: str = "gnnwr_pass"
    POSTGRES_DB: str = "gnnwr_platform"

    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    # compose 部署下 Redis 开启 requirepass（P1-6）；本地无密码 Redis 留空即可
    REDIS_PASSWORD: str = ""

    STORAGE_BACKEND: str = "auto"  # auto | minio | local
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "gnnwr"
    MINIO_SECURE: bool = False
    LOCAL_STORAGE_DIR: str = "./data/storage"
    MAX_UPLOAD_MB: int = 200

    GEOSERVER_URL: str = "http://localhost:8080/geoserver"
    GEOSERVER_USER: str = "admin"
    GEOSERVER_PASSWORD: str = "geoserver"
    GEOSERVER_WORKSPACE: str = "gnnwr"

    VECTOR_OUTPUT_CRS: str = "WGS84"
    SURFACE_TILE_CRS: str = "GCJ02"

    ENGINE_BACKEND: str = "gnnwr_lite"

    # ---- 任务资源上限（P1-3）----
    # soft 到点抛 SoftTimeLimitExceeded，任务自行落 FAILED；hard 到点直接杀子进程兜底。
    TRAIN_SOFT_TIME_LIMIT_S: int = 4 * 3600
    TRAIN_TIME_LIMIT_S: int = 4 * 3600 + 300
    PREPROCESS_SOFT_TIME_LIMIT_S: int = 30 * 60
    PREPROCESS_TIME_LIMIT_S: int = 30 * 60 + 120
    # 单用户同时处于 PENDING/RUNNING 的训练任务数上限，避免一人占满 gpu_queue。
    MAX_ACTIVE_TRAIN_TASKS_PER_USER: int = 3

    CORS_ORIGINS: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://localhost:4173",
            "http://localhost",
        ]
    )

    @property
    def sqlalchemy_uri(self) -> str:
        return (
            f"postgresql+psycopg://{quote(self.POSTGRES_USER, safe='')}:"
            f"{quote(self.POSTGRES_PASSWORD, safe='')}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def redis_uri(self) -> str:
        auth = f":{quote(self.REDIS_PASSWORD, safe='')}@" if self.REDIS_PASSWORD else ""
        return f"redis://{auth}{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    @property
    def ws_must_auth(self) -> bool:
        """非 DEBUG 一律要求 WS 鉴权；DEBUG 下仍默认要求，可用 WS_REQUIRE_AUTH=false 放开。"""
        if not self.DEBUG:
            return True
        return self.WS_REQUIRE_AUTH


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
