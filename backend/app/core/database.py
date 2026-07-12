"""SQLAlchemy 2.0 引擎/会话/Base。PostGIS 几何字段由 GeoAlchemy2 提供。"""
from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.sqlalchemy_uri,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    echo=settings.DEBUG,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    """所有 ORM 模型的基类。"""


def get_db() -> Generator:
    """FastAPI 依赖：每请求一个会话。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """开发期建表；生产建议用 Alembic 迁移 + 手动建 PostGIS 扩展与空间索引。"""
    from app import models  # noqa: F401  确保模型被注册
    Base.metadata.create_all(bind=engine)
