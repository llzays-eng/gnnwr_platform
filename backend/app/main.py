"""
FastAPI 应用入口（空间服务层）。
挂载 v1 路由、CORS、启动时建表；提供健康检查与算法自检端点。
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 开发期自动建表（生产用 Alembic）。DB 不可用时不阻断启动，便于先看文档。
    try:
        from app.core.database import init_db
        init_db()
    except Exception as exc:  # noqa: BLE001
        print(f"[启动] 建表跳过（数据库暂不可用）：{exc}")
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="基于 GNNWR/GTNNWR 的时空智能分析云平台 —— 空间服务层 API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/", tags=["health"])
def root():
    return {"app": settings.APP_NAME, "docs": "/docs", "api": settings.API_V1_PREFIX}


@app.get("/health", tags=["health"])
def health():
    status = {"api": "ok"}
    try:
        from sqlalchemy import text
        from app.core.database import engine
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        status["postgres"] = "ok"
    except Exception:
        status["postgres"] = "unavailable"
    try:
        import redis
        redis.from_url(settings.redis_uri).ping()
        status["redis"] = "ok"
    except Exception:
        status["redis"] = "unavailable"
    from app.services.storage import storage
    status["storage"] = storage.backend
    return status
