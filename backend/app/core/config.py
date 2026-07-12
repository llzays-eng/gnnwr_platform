"""全局配置：读取环境变量 / .env（对齐大纲第三章各存储与算力组件）。"""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # 基本
    APP_NAME: str = "GNNWR 时空智能分析云平台"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = True

    # 安全（JWT，三级角色见 security.py：guest / user / admin）
    SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION_please_use_openssl_rand_hex_32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    # PostgreSQL + PostGIS
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "gnnwr"
    POSTGRES_PASSWORD: str = "gnnwr_pass"
    POSTGRES_DB: str = "gnnwr_platform"

    # Redis（Celery broker/backend + 缓存 + 分布式锁 + WebSocket 广播）
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0

    # MinIO（对象存储，优先适配学院自建服务器场景）
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "gnnwr"
    MINIO_SECURE: bool = False
    # 无 MinIO 时的本地回退目录（一期单体部署可直接用本地磁盘）
    LOCAL_STORAGE_DIR: str = "/tmp/gnnwr-storage"

    # GeoServer
    GEOSERVER_URL: str = "http://localhost:8080/geoserver"
    GEOSERVER_USER: str = "admin"
    GEOSERVER_PASSWORD: str = "geoserver"
    GEOSERVER_WORKSPACE: str = "gnnwr"

    # CORS
    CORS_ORIGINS: list[str] = Field(default_factory=lambda: ["http://localhost:5173", "http://localhost"])

    @property
    def sqlalchemy_uri(self) -> str:
        return (
            f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def redis_uri(self) -> str:
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
