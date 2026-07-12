"""训练进度广播：Celery worker 侧 publish，FastAPI WebSocket 侧 subscribe。"""
from __future__ import annotations

import json

import redis

from app.core.config import settings


def channel(task_id: str) -> str:
    return f"train:progress:{task_id}"


def publish_progress(task_id: str, payload: dict) -> None:
    """worker 侧调用：把一条 {epoch,train_loss,val_loss,...} 推到 Redis 频道。"""
    r = redis.from_url(settings.redis_uri)
    try:
        r.publish(channel(task_id), json.dumps(payload, ensure_ascii=False))
    finally:
        r.close()
