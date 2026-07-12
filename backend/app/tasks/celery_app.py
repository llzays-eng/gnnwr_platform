"""
Celery 应用（大纲 3.5 · 分布式任务队列）
=====================================
- broker / result backend 均用 Redis。
- 双队列：cpu_queue（清洗、坐标转换等轻量）/ gpu_queue（GNNWR/GTNNWR 训练，
  路由到实验室 GPU 服务器）。
- 任务序列化用 JSON，禁用 pickle 以策安全。
"""
from __future__ import annotations

from celery import Celery
from kombu import Queue

from app.core.config import settings

celery_app = Celery(
    "gnnwr",
    broker=settings.redis_uri,
    backend=settings.redis_uri,
    include=["app.tasks.training", "app.tasks.ingest_task"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Shanghai",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,          # 长任务：一次只取一个，避免堆积
    task_acks_late=True,
    task_queues=(
        Queue("cpu_queue"),
        Queue("gpu_queue"),
    ),
    task_default_queue="cpu_queue",
    task_routes={
        "app.tasks.training.*": {"queue": "gpu_queue"},
        "app.tasks.ingest_task.*": {"queue": "cpu_queue"},
    },
)
