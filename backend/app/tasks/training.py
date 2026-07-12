"""
建模训练任务（大纲 7.3 伪代码的真实落地）
=======================================
把大纲里 train_task 的"设计示意"变成可运行任务：
  读取样本 → 调用统一引擎 run_analysis（离线用 gnnwr_lite，生产切真实 gnnwr 包）
  → 周期性经 Redis 推 loss/epoch → 落库 model_results / baseline_comparisons。

状态机：PENDING → RUNNING → SUCCESS / FAILED，与 model_tasks.status 对齐。
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# 让 worker 能 import 顶层 engine 包（部署时 engine 与 backend 同置于项目根）
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

import pandas as pd  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.models.model_task import BaselineComparison, ModelResult, ModelTask  # noqa: E402
from app.services.storage import storage  # noqa: E402
from app.tasks.celery_app import celery_app  # noqa: E402
from app.tasks.progress import publish_progress  # noqa: E402
from engine.pipeline import FieldMapping, run_analysis  # noqa: E402


def _set_status(db, task: ModelTask, status: str, **fields):
    task.status = status
    for k, v in fields.items():
        setattr(task, k, v)
    db.commit()


@celery_app.task(bind=True, name="app.tasks.training.train_task", queue="gpu_queue")
def train_task(self, task_id: str, csv_key: str):
    """
    task_id: model_tasks.id（业务主键）
    csv_key: 训练样本在对象存储中的 key（清洗后导出的 CSV）
    """
    db = SessionLocal()
    try:
        task = db.get(ModelTask, task_id)
        if task is None:
            return {"task_id": task_id, "error": "task not found"}

        _set_status(db, task, "RUNNING", celery_task_id=self.request.id, progress=0.0)

        # 载入样本
        local_csv = storage.local_path(csv_key)
        df = pd.read_csv(local_csv)

        mapping = FieldMapping(
            y=task.y_column, x=list(task.x_columns),
            spatial=list(task.spatial_columns), temporal=task.temporal_column,
        )
        hp = dict(task.hyperparams or {})
        max_epoch = int(hp.get("max_epoch", 200))

        # 进度回调：换算成百分比并广播（前端 WebSocket 实时画 loss 曲线）
        def cb(rec: dict):
            pct = min(rec["epoch"] / max_epoch, 1.0) * 100.0
            task.progress = pct
            db.commit()
            publish_progress(task_id, {
                "epoch": rec["epoch"], "train_loss": rec["train_loss"],
                "val_loss": rec["val_loss"], "progress": round(pct, 1),
            })

        result = run_analysis(df, mapping, hyperparams=hp, progress_cb=cb)

        # 逐点系数 + 残差落对象存储（大文件不入库，DB 只存路径与摘要）
        coef_key = f"results/{task_id}/coefficients.json"
        storage.put_bytes(coef_key,
                          json.dumps(result["coefficients"], ensure_ascii=False).encode("utf-8"),
                          content_type="application/json")

        res = ModelResult(
            task_id=task_id,
            r2=result["metrics"]["r2"], rmse=result["metrics"]["rmse"],
            mae=result["metrics"]["mae"], aicc=result["metrics"]["aicc"],
            model_weight_path=None,  # 真实 gnnwr 包在此写 .pth 的 key
            coefficients_summary={
                "columns": result["coefficients"]["columns"],
                "beta_ols": result["beta_ols"],
                "coefficients_key": coef_key,
                "history_len": len(result.get("history", [])),
            },
            residuals_path=coef_key,
        )
        db.add(res)

        for b in result["baselines"]:
            db.add(BaselineComparison(task_id=task_id, method=b["method"],
                                     r2=b["r2"], rmse=b["rmse"], mae=b["mae"]))

        _set_status(db, task, "SUCCESS", progress=100.0,
                    finished_at=datetime.now(timezone.utc))
        publish_progress(task_id, {"status": "SUCCESS", "progress": 100.0})
        return {"task_id": task_id, "metrics": result["metrics"]}

    except Exception as exc:  # noqa: BLE001
        db.rollback()
        task = db.get(ModelTask, task_id)
        if task is not None:
            _set_status(db, task, "FAILED", error=str(exc)[:480],
                        finished_at=datetime.now(timezone.utc))
        publish_progress(task_id, {"status": "FAILED", "error": str(exc)[:480]})
        raise
    finally:
        db.close()
