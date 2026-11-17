"""数据集：单次上传 / 分片 / 预签名 / 预览 / 预处理 / 列表。"""
from __future__ import annotations

import json
import os
import tempfile
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.redis_client import get_sync_redis, redis_available
from app.models.project import Dataset, Project
from app.models.user import User
from app.schemas.common import Paginated, page_args
from app.schemas.dataset import (
    ChunkInitRequest, ChunkInitResponse, DatasetOut, PreprocessRequest,
    PresignResponse, PreviewResponse,
)
from app.services import ingest
from app.services.crs_transform import normalize_crs, offshore_ratio, wgs84_to_gcj02
from app.services.field_mapper import infer_field_schema, suggest_mapping
from app.services.jobs import BrokerUnavailable, enqueue
from app.services.serialize import dataset_out
from app.services.storage import storage
from app.tasks.ingest_task import preprocess_task, run_preprocess

router = APIRouter(prefix="/datasets", tags=["datasets"])

_ALLOWED = {"csv", "tsv", "xlsx", "xls", "geojson", "json"}
# 只有按行的文本格式能在不整读入内存的前提下抽样识别；超过单次上限的大文件只收这两种。
_STREAMABLE = {"csv", "tsv"}
_MAX = settings.MAX_UPLOAD_MB * 1024 * 1024
_MAX_CHUNKED = 2 * 1024 ** 3
_READ_BLOCK = 1024 * 1024
# 分片上传完成时只读前 N 行推断字段，避免 2GB 文件在 API 进程里被 pandas 整体解析。
_INSPECT_ROWS = 50_000


def _owns_project(db: Session, project_id: str, user: User) -> Project:
    proj = db.get(Project, project_id)
    if not proj or proj.user_id != user.id:
        raise HTTPException(status_code=404, detail="项目不存在")
    return proj


def _owns_dataset(db: Session, dataset_id: str, user: User) -> Dataset:
    ds = db.get(Dataset, dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="数据集不存在")
    _owns_project(db, ds.project_id, user)
    return ds


def _ext_of(name: str) -> str:
    return (name or "").rsplit(".", 1)[-1].lower() if "." in (name or "") else "csv"


def _format_of(ext: str) -> str:
    if ext in ("xlsx", "xls"):
        return "excel"
    if ext in ("geojson", "json"):
        return "geojson"
    if ext in ("zip", "shp"):
        return "shapefile"
    return "csv"


def _create_dataset_record(db: Session, project_id: str, filename: str, key: str,
                           ext: str, size: int, source_crs: str | None,
                           schema_json: list, guess: dict) -> Dataset:
    ds = Dataset(
        project_id=project_id,
        name=filename,
        filename=filename,
        storage_path=key,
        file_type=ext,
        format=_format_of(ext),
        source_crs=source_crs,
        size_bytes=size,
        status="uploaded",
        schema_json=schema_json,
        column_guess=guess,
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return ds


def _inspect_bytes(data: bytes, ext: str) -> tuple[list, dict, int]:
    df = ingest.read_tabular(data, ext)
    sug = suggest_mapping(df)
    return infer_field_schema(df), sug.as_column_guess(), len(df)


def _inspect_text_file(path: str, ext: str) -> tuple[list, dict, int]:
    """CSV/TSV：抽样前 _INSPECT_ROWS 行推断字段，行数按换行符流式计数。

    行数是近似值（字段内含换行时偏大）；预处理完成后 row_count 会被真实入库行数覆盖。
    """
    import pandas as pd

    sep = "\t" if ext == "tsv" else ","
    df = pd.read_csv(path, sep=sep, nrows=_INSPECT_ROWS)
    sug = suggest_mapping(df)
    newlines = 0
    last = b""
    with open(path, "rb") as fh:
        while block := fh.read(_READ_BLOCK):
            newlines += block.count(b"\n")
            last = block[-1:]
    rows = newlines + (1 if last and last != b"\n" else 0) - 1  # 减表头
    return infer_field_schema(df), sug.as_column_guess(), max(rows, len(df))


async def _read_upload_limited(file: UploadFile, limit: int) -> bytes:
    """按块读取，超过 limit 立即 413，不把超限文件整读进内存。"""
    too_big = HTTPException(
        status_code=413, detail=f"文件超过 {settings.MAX_UPLOAD_MB}MB，请走分片上传",
    )
    if file.size is not None and file.size > limit:
        raise too_big
    buf = bytearray()
    while block := await file.read(_READ_BLOCK):
        buf.extend(block)
        if len(buf) > limit:
            raise too_big
    return bytes(buf)


def _chunk_count(meta: dict) -> int:
    chunk_size = int(meta["chunk_size"])
    return (int(meta["size"]) + chunk_size - 1) // chunk_size


def _expected_chunk_len(meta: dict, n: int) -> int:
    chunk_size = int(meta["chunk_size"])
    total = _chunk_count(meta)
    if n < total - 1:
        return chunk_size
    return int(meta["size"]) - chunk_size * (total - 1)


@router.post("/upload", response_model=DatasetOut, status_code=201)
async def upload(project_id: str = Form(...), file: UploadFile = File(...),
                 source_crs: str | None = Form(None),
                 db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _owns_project(db, project_id, user)
    ext = _ext_of(file.filename or "dataset.csv")
    if ext not in _ALLOWED:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型：.{ext}")
    data = await _read_upload_limited(file, _MAX)

    ds_id = str(uuid.uuid4())
    key = f"datasets/{ds_id}/raw.{ext}"
    storage.put_bytes(key, data)
    try:
        schema_json, guess, n = _inspect_bytes(data, ext)
    except Exception:
        schema_json, guess, n = [], {}, 0

    ds = Dataset(
        id=ds_id, project_id=project_id,
        name=file.filename or "dataset", filename=file.filename or "dataset",
        storage_path=key, file_type=ext, format=_format_of(ext),
        source_crs=source_crs, size_bytes=len(data), row_count=n,
        status="uploaded", schema_json=schema_json, column_guess=guess,
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return dataset_out(ds)


@router.post("/upload/init", response_model=ChunkInitResponse)
def upload_init(payload: ChunkInitRequest, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    _owns_project(db, payload.project_id, user)
    ext = _ext_of(payload.filename)
    if ext not in _ALLOWED:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型：.{ext}")
    if payload.size > _MAX_CHUNKED:
        raise HTTPException(status_code=413, detail="单文件上限 2GB")
    if payload.size > _MAX and ext not in _STREAMABLE:
        raise HTTPException(
            status_code=413,
            detail=f"超过 {settings.MAX_UPLOAD_MB}MB 的大文件仅支持 CSV/TSV，请先转换格式",
        )
    upload_id = str(uuid.uuid4())
    meta = {
        "project_id": payload.project_id, "filename": payload.filename,
        "size": payload.size, "chunk_size": payload.chunk_size,
        "source_crs": payload.source_crs, "user_id": user.id,
        "chunks": [],
    }
    if redis_available():
        get_sync_redis().setex(f"upload:{upload_id}", 86400, json.dumps(meta))
    else:
        storage.put_bytes(f"uploads/{upload_id}/meta.json", json.dumps(meta).encode())
    return ChunkInitResponse(upload_id=upload_id, uploaded_chunks=[], chunk_size=payload.chunk_size)


def _load_upload_meta(upload_id: str) -> dict:
    if redis_available():
        raw = get_sync_redis().get(f"upload:{upload_id}")
        if not raw:
            raise HTTPException(status_code=404, detail="upload_id 不存在或已过期")
        return json.loads(raw)
    try:
        return json.loads(storage.get_bytes(f"uploads/{upload_id}/meta.json"))
    except Exception:
        raise HTTPException(status_code=404, detail="upload_id 不存在或已过期")


def _save_upload_meta(upload_id: str, meta: dict) -> None:
    if redis_available():
        get_sync_redis().setex(f"upload:{upload_id}", 86400, json.dumps(meta))
    else:
        storage.put_bytes(f"uploads/{upload_id}/meta.json", json.dumps(meta).encode())


def _drop_upload_meta(upload_id: str) -> None:
    if redis_available():
        get_sync_redis().delete(f"upload:{upload_id}")
    else:
        storage.delete(f"uploads/{upload_id}/meta.json")


@router.put("/upload/{upload_id}/chunk/{n}")
async def upload_chunk(upload_id: str, n: int, request: Request,
                       user: User = Depends(get_current_user)):
    meta = _load_upload_meta(upload_id)
    if meta.get("user_id") != user.id:
        raise HTTPException(status_code=404, detail="upload_id 不存在或已过期")
    total = _chunk_count(meta)
    if not 0 <= n < total:
        raise HTTPException(status_code=400, detail=f"分片序号越界：应在 0..{total - 1}")
    expected = _expected_chunk_len(meta, n)
    wrong_size = HTTPException(status_code=413, detail=f"分片 {n} 应为 {expected} 字节")
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > expected:
        raise wrong_size
    # 流式读取并计数：单片内存占用不超过 chunk_size（≤64MB），超长立即中止。
    buf = bytearray()
    async for block in request.stream():
        buf.extend(block)
        if len(buf) > expected:
            raise wrong_size
    if len(buf) != expected:
        raise HTTPException(
            status_code=400, detail=f"分片 {n} 应为 {expected} 字节，实际 {len(buf)}",
        )
    storage.put_bytes(f"uploads/{upload_id}/chunk_{n}", bytes(buf))
    chunks = set(meta.get("chunks") or [])
    chunks.add(n)
    meta["chunks"] = sorted(chunks)
    _save_upload_meta(upload_id, meta)
    return {"ok": True, "index": n}


@router.post("/upload/{upload_id}/complete", response_model=DatasetOut)
def upload_complete(upload_id: str, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    meta = _load_upload_meta(upload_id)
    if meta.get("user_id") != user.id:
        raise HTTPException(status_code=404, detail="upload_id 不存在或已过期")
    _owns_project(db, meta["project_id"], user)
    ext = _ext_of(meta["filename"])
    if ext not in _ALLOWED:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型：.{ext}")
    total = _chunk_count(meta)
    prefix = f"uploads/{upload_id}/"
    present = set(storage.list_prefix(prefix))
    missing = [i for i in range(total) if f"{prefix}chunk_{i}" not in present]
    if missing:
        raise HTTPException(
            status_code=409,
            detail={"message": "分片未传完", "missing_chunks": missing[:100],
                    "missing_count": len(missing)},
        )

    ds_id = str(uuid.uuid4())
    key = f"datasets/{ds_id}/raw.{ext}"
    # 逐片追加到临时文件再整体上传：内存峰值约为单片大小，而不是整个文件的数倍。
    fd, tmp_path = tempfile.mkstemp(prefix="gnnwr-upload-", suffix=f".{ext}")
    try:
        written = 0
        with os.fdopen(fd, "wb") as out:
            for i in range(total):
                part = storage.get_bytes(f"{prefix}chunk_{i}")
                out.write(part)
                written += len(part)
        if written != int(meta["size"]):
            raise HTTPException(
                status_code=400, detail=f"合并后大小 {written} 与声明的 {meta['size']} 不符",
            )
        storage.put_file(key, tmp_path)
        try:
            if ext in _STREAMABLE:
                schema_json, guess, n = _inspect_text_file(tmp_path, ext)
            else:
                # 非 CSV/TSV 在 init 阶段已被限制在 MAX_UPLOAD_MB 以内
                with open(tmp_path, "rb") as fh:
                    schema_json, guess, n = _inspect_bytes(fh.read(), ext)
        except Exception:
            schema_json, guess, n = [], {}, 0
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    ds = Dataset(
        id=ds_id, project_id=meta["project_id"],
        name=meta["filename"], filename=meta["filename"],
        storage_path=key, file_type=ext, format=_format_of(ext),
        source_crs=meta.get("source_crs"), size_bytes=written, row_count=n,
        status="uploaded", schema_json=schema_json, column_guess=guess,
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)
    # 清理分片与会话：释放存储，也让同一个 upload_id 不能再 complete 出第二个数据集。
    for i in range(total):
        storage.delete(f"{prefix}chunk_{i}")
    _drop_upload_meta(upload_id)
    return dataset_out(ds)


@router.post("/upload/presign", response_model=PresignResponse)
def upload_presign(payload: ChunkInitRequest, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    _owns_project(db, payload.project_id, user)
    upload_id = str(uuid.uuid4())
    ext = _ext_of(payload.filename)
    key = f"uploads/{upload_id}/raw.{ext}"
    url = storage.presign_put(key)
    if not url:
        raise HTTPException(status_code=501, detail="当前存储后端不支持预签名，请走分片或单次上传")
    meta = {**payload.model_dump(), "user_id": user.id, "object_key": key}
    if redis_available():
        get_sync_redis().setex(f"upload:{upload_id}", 3600, json.dumps(meta))
    return PresignResponse(upload_id=upload_id, url=url, object_key=key, expires_in=3600)


@router.get("/{dataset_id}/preview", response_model=PreviewResponse)
def preview(dataset_id: str, rows: int = Query(20, alias="rows", ge=1, le=1000),
            n: int | None = Query(None, ge=1, le=1000),
            db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ds = _owns_dataset(db, dataset_id, user)
    limit = n or rows
    raw = storage.get_bytes(ds.storage_path)
    df = ingest.read_tabular(raw, ds.file_type)
    sug = suggest_mapping(df)

    spatial_sample: list[list[float]] = []
    points = []
    src = ds.source_crs or "WGS84"
    if sug.lon and sug.lat:
        sample = df[[sug.lon, sug.lat]].dropna()
        step = max(1, len(sample) // 800)
        for i, (_, r) in enumerate(sample.iterrows()):
            try:
                lon, lat = float(r[sug.lon]), float(r[sug.lat])
            except (ValueError, TypeError):
                continue
            spatial_sample.append([lon, lat])
            if i % step == 0:
                # preview `points` are GCJ-02 for Amap; WGS84/CGCS2000 are shifted once.
                if normalize_crs(src) == "GCJ02":
                    glon, glat = lon, lat
                else:
                    glon, glat = wgs84_to_gcj02(lon, lat)
                points.append({"lon": round(glon, 6), "lat": round(glat, 6)})
            if len(spatial_sample) >= 2000:
                break

    head = df.head(limit).where(df.head(limit).notna(), None)
    return PreviewResponse(
        dataset_id=ds.id,
        total_rows=len(df),
        n_rows_total=len(df),
        columns=list(df.columns),
        rows=head.to_dict(orient="records"),
        spatial_sample=spatial_sample[:800],
        offshore_ratio=round(offshore_ratio([(p[0], p[1]) for p in spatial_sample]), 4),
        mapping_suggestion=sug.to_dict(),
        points=points[:2000],
    )


@router.post("/{dataset_id}/preprocess", response_model=DatasetOut, status_code=202)
def preprocess(dataset_id: str, payload: PreprocessRequest,
               db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ds = _owns_dataset(db, dataset_id, user)
    raw = storage.get_bytes(ds.storage_path)
    df = ingest.read_tabular(raw, ds.file_type)
    sug = suggest_mapping(df)
    lon = payload.lon_col() or sug.lon
    lat = payload.lat_col() or sug.lat
    if not lon or not lat:
        raise HTTPException(status_code=422, detail="未指定经纬度列")
    mapping = {
        "y": payload.y or sug.y,
        "x": payload.x if payload.x is not None else sug.x,
        "lon": lon, "lat": lat,
        "temporal": payload.time_col() or sug.temporal,
        "source_crs": payload.source_crs or ds.source_crs or "WGS84",
        "drop_invalid_rows": payload.drop_invalid_rows,
        "longitude_column": lon, "latitude_column": lat,
        "temporal_column": payload.time_col() or sug.temporal,
    }
    ds.status = "cleaning"
    ds.source_crs = mapping["source_crs"]
    ds.mapping = mapping
    db.commit()

    try:
        celery_id, inline = enqueue(
            preprocess_task.delay, dataset_id, mapping, fallback=run_preprocess,
        )
    except BrokerUnavailable as exc:
        ds.status = "uploaded"
        ds.status_detail = {"error": str(exc), "code": "QUEUE_UNAVAILABLE"}
        db.commit()
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    db.refresh(ds)
    if inline:
        db.refresh(ds)
    _ = celery_id
    return dataset_out(ds)


@router.get("", response_model=Paginated[DatasetOut])
def list_datasets(project_id: str = Query(..., description="必填"),
                  page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _owns_project(db, project_id, user)
    page, page_size, offset = page_args(page, page_size)
    q = select(Dataset).where(Dataset.project_id == project_id)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    items = db.scalars(q.order_by(Dataset.created_at.desc()).offset(offset).limit(page_size)).all()
    return Paginated(items=[dataset_out(d) for d in items], total=total, page=page, page_size=page_size)
