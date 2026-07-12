"""建模接口：提交训练 / 状态查询 / 结果 / 基线对比 / WebSocket 进度推送。"""
from __future__ import annotations

import asyncio
import json

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal, get_db
from app.core.deps import get_current_user
from app.models.model_task import ModelTask
from app.models.project import Dataset, Project
from app.models.user import User
from app.schemas import (BaselineOut, CompareOut, Metrics, ResultOut,
                         TaskStatusOut, TrainRequest)
from app.tasks.progress import channel

router = APIRouter(prefix="/models", tags=["models"])


def _check_owner(db: Session, project_id: str, user: User):
    proj = db.get(Project, project_id)
    if not proj or proj.user_id != user.id:
        raise HTTPException(status_code=404, detail="项目不存在")


@router.post("/train", response_model=TaskStatusOut, status_code=202)
def train(req: TrainRequest, db: Session = Depends(get_db),
          user: User = Depends(get_current_user)):
    _check_owner(db, req.project_id, user)
    ds = db.get(Dataset, req.dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="数据集不存在")
    if req.model_type.upper() == "GTNNWR" and not req.temporal_column:
        raise HTTPException(status_code=400, detail="GTNNWR 需要指定时间字段")

    hp = req.hyperparams.model_dump()
    hp.update({"test_ratio": req.test_ratio, "valid_ratio": req.valid_ratio})

    task = ModelTask(
        project_id=req.project_id, dataset_id=req.dataset_id,
        model_type=req.model_type.upper(), x_columns=req.x_columns, y_column=req.y_column,
        spatial_columns=req.spatial_columns, temporal_column=req.temporal_column,
        hyperparams=hp, status="PENDING",
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    # 训练任务读取清洗后的 CSV
    csv_key = f"datasets/{req.dataset_id}/cleaned.csv"
    from app.tasks.training import train_task
    async_res = train_task.delay(task.id, csv_key)
    task.celery_task_id = async_res.id
    db.commit()
    return TaskStatusOut(task_id=task.id, status=task.status, progress=task.progress,
                         model_type=task.model_type, error=task.error)


@router.get("/tasks/{task_id}/status", response_model=TaskStatusOut)
def status(task_id: str, db: Session = Depends(get_db),
           user: User = Depends(get_current_user)):
    task = db.get(ModelTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    _check_owner(db, task.project_id, user)
    return TaskStatusOut(task_id=task.id, status=task.status, progress=task.progress,
                         model_type=task.model_type, error=task.error)


@router.get("/tasks/{task_id}/result", response_model=ResultOut)
def result(task_id: str, db: Session = Depends(get_db),
           user: User = Depends(get_current_user)):
    task = db.get(ModelTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    _check_owner(db, task.project_id, user)
    if task.status != "SUCCESS" or task.result is None:
        raise HTTPException(status_code=409, detail=f"任务尚未完成（当前 {task.status}）")
    r = task.result
    return ResultOut(
        task_id=task_id, status=task.status, model_type=task.model_type,
        metrics=Metrics(r2=r.r2, rmse=r.rmse, mae=r.mae, aicc=r.aicc),
        beta_ols=r.coefficients_summary.get("beta_ols", {}),
        coefficients_key=r.coefficients_summary.get("coefficients_key"),
    )


@router.get("/tasks/{task_id}/compare", response_model=CompareOut)
def compare(task_id: str, db: Session = Depends(get_db),
            user: User = Depends(get_current_user)):
    task = db.get(ModelTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    _check_owner(db, task.project_id, user)
    if task.result is None:
        raise HTTPException(status_code=409, detail="任务尚未完成")
    return CompareOut(
        task_id=task_id, model_type=task.model_type,
        main=Metrics(r2=task.result.r2, rmse=task.result.rmse,
                     mae=task.result.mae, aicc=task.result.aicc),
        baselines=[BaselineOut(method=b.method, r2=b.r2, rmse=b.rmse, mae=b.mae)
                   for b in task.baselines],
    )


@router.get("/tasks/{task_id}/coefficients")
def coefficients(task_id: str, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    """返回逐点局部系数 GeoJSON-ready 数据（前端热力图/系数动画数据源）。"""
    task = db.get(ModelTask, task_id)
    if not task or task.result is None:
        raise HTTPException(status_code=404, detail="结果不存在")
    _check_owner(db, task.project_id, user)
    from app.services.storage import storage
    key = task.result.coefficients_summary.get("coefficients_key")
    data = storage.get_bytes(key)
    return json.loads(data.decode("utf-8"))


@router.websocket("/tasks/{task_id}/ws")
async def ws_progress(websocket: WebSocket, task_id: str):
    """
    训练进度实时推送（大纲 API：WS /ws/models/tasks/{task_id}）。
    订阅 Redis 频道，把 worker 推来的 loss/epoch 转发给前端。
    """
    await websocket.accept()
    r = aioredis.from_url(settings.redis_uri)
    pubsub = r.pubsub()
    await pubsub.subscribe(channel(task_id))

    # 连接瞬间先补发一次当前状态，避免错过已结束的任务
    db = SessionLocal()
    try:
        task = db.get(ModelTask, task_id)
        if task:
            await websocket.send_json({"status": task.status, "progress": task.progress})
    finally:
        db.close()

    try:
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=30)
            if msg and msg.get("type") == "message":
                payload = json.loads(msg["data"])
                await websocket.send_json(payload)
                if payload.get("status") in ("SUCCESS", "FAILED"):
                    break
            await asyncio.sleep(0.05)
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(channel(task_id))
        await r.close()
