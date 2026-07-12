"""空间查询接口（大纲 4.2 · 空间查询服务 / 7.2 大规模渲染）。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.model_task import ModelTask
from app.models.user import User
from app.services.crs_transform import wgs84_to_gcj02
from app.services.geoserver import geoserver

router = APIRouter(prefix="/spatial", tags=["spatial"])


@router.get("/tiles")
def tiles(dataset_id: str,
          bbox: str = Query(..., description="minLon,minLat,maxLon,maxLat（GCJ-02 或 WGS84）"),
          time_from: str | None = None, time_to: str | None = None,
          limit: int = 5000, db: Session = Depends(get_db),
          user: User = Depends(get_current_user)):
    """
    按地图视野 BBox + 时间范围增量查询地理要素，避免一次性回传全部点造成前端卡顿。
    依赖 GiST 空间索引 + ST_Intersects（大纲 7.2）。
    """
    try:
        min_lon, min_lat, max_lon, max_lat = (float(v) for v in bbox.split(","))
    except ValueError:
        raise HTTPException(status_code=400, detail="bbox 格式应为 minLon,minLat,maxLon,maxLat")

    sql = """
        SELECT ST_X(geom) AS lon, ST_Y(geom) AS lat, observed_time, properties
        FROM spatial_features
        WHERE dataset_id = :did
          AND ST_Intersects(geom, ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326))
    """
    params = {"did": dataset_id, "min_lon": min_lon, "min_lat": min_lat,
              "max_lon": max_lon, "max_lat": max_lat, "limit": limit}
    if time_from:
        sql += " AND observed_time >= :tf"; params["tf"] = time_from
    if time_to:
        sql += " AND observed_time <= :tt"; params["tt"] = time_to
    sql += " LIMIT :limit"

    rows = db.execute(text(sql), params).mappings().all()
    feats = []
    for r in rows:
        lon, lat = wgs84_to_gcj02(r["lon"], r["lat"])   # 出库纠偏
        feats.append({"lon": round(lon, 6), "lat": round(lat, 6),
                      "time": r["observed_time"].isoformat() if r["observed_time"] else None,
                      "properties": r["properties"]})
    return {"count": len(feats), "features": feats}


@router.get("/surface/{task_id}")
def surface(task_id: str, db: Session = Depends(get_db),
            user: User = Depends(get_current_user)):
    """返回该任务反演结果的 WMS 图层地址（若已发布到 GeoServer）。"""
    task = db.get(ModelTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    layer = f"{geoserver.ws}:surface_{task_id}"
    return {"task_id": task_id, "wms_url": geoserver.wms_url(layer), "layer": layer}
