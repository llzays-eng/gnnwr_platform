"""
Celery 应用。
- broker / result backend 均用 Redis
- cpu_queue：清洗入库；gpu_queue：训练（可在 CPU 上回落跑 gnnwr_lite）
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
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_queues=(Queue("cpu_queue"), Queue("gpu_queue")),
    task_default_queue="cpu_queue",
    task_routes={
        "app.tasks.training.*": {"queue": "gpu_queue"},
        "app.tasks.ingest_task.*": {"queue": "cpu_queue"},
    },
    # P1-3：没有超时的话，一个超大/卡死的任务会永久占住 -c 1 的 worker。
    # 这里给全局兜底；训练/预处理在各自 @task 上用更具体的 settings 值覆盖。
    task_soft_time_limit=settings.TRAIN_SOFT_TIME_LIMIT_S,
    task_time_limit=settings.TRAIN_TIME_LIMIT_S,
    # acks_late 下 worker 子进程被杀（OOM / hard limit）时不要把消息退回队列，
    # 否则同一个会打挂 worker 的任务会被反复投递。
    task_reject_on_worker_lost=False,
)
