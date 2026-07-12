"""数据集接口：上传 / 触发预处理 / 预览（含字段映射建议 + 地图打点）。"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.project import Dataset, Project
from app.models.user import User
from app.schemas import DatasetOut, PreprocessRequest, PreviewResponse
from app.services import ingest
from app.services.crs_transform import wgs84_to_gcj02
from app.services.field_mapper import suggest_mapping
from app.services.storage import storage

router = APIRouter(prefix="/datasets", tags=["datasets"])

_ALLOWED = {"csv", "tsv", "xlsx", "xls", "geojson", "json"}


def _owns_project(db: Session, project_id: str, user: User) -> Project:
    proj = db.get(Project, project_id)
    if not proj or proj.user_id != user.id:
        raise HTTPException(status_code=404, detail="项目不存在")
    return proj


@router.post("/upload", response_model=DatasetOut, status_code=201)
async def upload(project_id: str = Form(...), file: UploadFile = File(...),
                 source_crs: str = Form("WGS84"),
                 db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _owns_project(db, project_id, user)
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in _ALLOWED:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型：.{ext}")
    data = await file.read()

    ds_id = str(uuid.uuid4())
    key = f"datasets/{ds_id}/raw.{ext}"
    storage.put_bytes(key, data)

    ds = Dataset(id=ds_id, project_id=project_id, name=file.filename or "dataset",
                 storage_path=key, file_type=ext, source_crs=source_crs, status="uploaded")
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return ds


@router.get("/{dataset_id}/preview", response_model=PreviewResponse)
def preview(dataset_id: str, n: int = 20, db: Session = Depends(get_db),
            user: User = Depends(get_current_user)):
    ds = db.get(Dataset, dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="数据集不存在")
    _owns_project(db, ds.project_id, user)

    raw = storage.get_bytes(ds.storage_path)
    df = ingest.read_tabular(raw, ds.file_type)
    sug = suggest_mapping(df)

    # 地图打点：把经纬度纠偏到 GCJ-02（前端用高德底图）
    points = []
    if sug.lon and sug.lat:
        sample = df[[sug.lon, sug.lat]].dropna().head(2000)
        for _, r in sample.iterrows():
            try:
                lon, lat = wgs84_to_gcj02(float(r[sug.lon]), float(r[sug.lat]))
                points.append({"lon": round(lon, 6), "lat": round(lat, 6)})
            except (ValueError, TypeError):
                continue

    head = df.head(n).where(df.head(n).notna(), None)
    return PreviewResponse(
        columns=list(df.columns),
        rows=head.to_dict(orient="records"),
        n_rows_total=len(df),
        mapping_suggestion=sug.to_dict(),
        points=points,
    )


@router.post("/{dataset_id}/preprocess", status_code=202)
def preprocess(dataset_id: str, payload: PreprocessRequest,
               db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ds = db.get(Dataset, dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="数据集不存在")
    _owns_project(db, ds.project_id, user)

    from app.tasks.ingest_task import preprocess_task
    async_res = preprocess_task.delay(dataset_id, payload.model_dump())
    ds.status = "cleaning"
    db.commit()
    return {"dataset_id": dataset_id, "celery_task_id": async_res.id, "status": "cleaning"}


@router.get("", response_model=list[DatasetOut])
def list_datasets(project_id: str, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    _owns_project(db, project_id, user)
    return db.query(Dataset).filter(Dataset.project_id == project_id) \
        .order_by(Dataset.created_at.desc()).all()
