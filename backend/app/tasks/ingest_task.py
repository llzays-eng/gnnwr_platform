"""数据预处理异步任务（大纲 API /datasets/{id}/preprocess）：清洗+坐标转换+入库。"""
from __future__ import annotations

from app.core.database import SessionLocal
from app.models.project import Dataset
from app.services import ingest
from app.services.storage import storage
from app.tasks.celery_app import celery_app


@celery_app.task(bind=True, name="app.tasks.ingest_task.preprocess_task", queue="cpu_queue")
def preprocess_task(self, dataset_id: str, mapping: dict):
    """
    mapping: {y, x[], lon, lat, temporal?, source_crs}
    产物：清洗后 CSV 回存对象存储 + 写入 spatial_features + 更新 dataset 状态/行数。
    """
    db = SessionLocal()
    try:
        ds = db.get(Dataset, dataset_id)
        if ds is None:
            return {"dataset_id": dataset_id, "error": "dataset not found"}

        raw = storage.get_bytes(ds.storage_path)
        df = ingest.read_tabular(raw, ds.file_type)

        cleaned, report = ingest.clean(
            df, y=mapping["y"], x=mapping["x"],
            lon=mapping["lon"], lat=mapping["lat"], temporal=mapping.get("temporal"),
        )

        # 清洗后 CSV 回存（供训练任务直接读取）
        cleaned_key = f"datasets/{dataset_id}/cleaned.csv"
        storage.put_bytes(cleaned_key, cleaned.to_csv(index=False).encode("utf-8"),
                          content_type="text/csv")

        n = ingest.ingest_to_postgis(
            db, dataset_id, cleaned,
            lon=mapping["lon"], lat=mapping["lat"], temporal=mapping.get("temporal"),
            source_crs=mapping.get("source_crs", "WGS84"),
        )

        ds.row_count = n
        ds.status = "ingested"
        db.commit()
        return {"dataset_id": dataset_id, "ingested": n, "cleaned_key": cleaned_key, "report": report}

    except Exception as exc:  # noqa: BLE001
        db.rollback()
        ds = db.get(Dataset, dataset_id)
        if ds is not None:
            ds.status = "failed"
            db.commit()
        raise
    finally:
        db.close()
