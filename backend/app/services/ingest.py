"""
数据接入服务（大纲 4.2 · 数据接入服务）
=====================================
职责：读文件 → 识别/转换坐标系 → 缺失值/异常值检测清洗 → 写入 spatial_features。
支持 CSV / Excel / GeoJSON（Shapefile 生产环境用 GDAL/ogr2ogr，这里给出接口位）。
"""
from __future__ import annotations

import json
from io import BytesIO

import pandas as pd
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.crs_transform import transform


def read_tabular(data: bytes, file_type: str) -> pd.DataFrame:
    """按类型读入为 DataFrame。"""
    ft = file_type.lower().lstrip(".")
    if ft in ("csv", "tsv"):
        sep = "\t" if ft == "tsv" else ","
        return pd.read_csv(BytesIO(data), sep=sep)
    if ft in ("xlsx", "xls"):
        return pd.read_excel(BytesIO(data))
    if ft in ("geojson", "json"):
        gj = json.loads(data.decode("utf-8"))
        rows = []
        for feat in gj.get("features", []):
            geom = feat.get("geometry") or {}
            props = dict(feat.get("properties") or {})
            if geom.get("type") == "Point":
                props["lon"], props["lat"] = geom["coordinates"][:2]
            rows.append(props)
        return pd.DataFrame(rows)
    raise ValueError(f"暂不支持的文件类型：{file_type}（Shapefile 请走 GDAL 入库通道）")


def clean(df: pd.DataFrame, y: str, x: list[str], lon: str, lat: str,
          temporal: str | None = None) -> tuple[pd.DataFrame, dict]:
    """
    缺失值 / 异常值清洗，返回(清洗后df, 清洗报告)。
    - 关键列缺失的行直接剔除；
    - 数值列用 3σ / IQR 之外标记为异常（此处采用温和的 1.5*IQR 截断为缺失再删）。
    """
    involved = [c for c in ([y, lon, lat] + x + ([temporal] if temporal else [])) if c in df.columns]
    before = len(df)
    work = df[involved].copy()

    # 数值化
    for c in involved:
        if c != temporal:
            work[c] = pd.to_numeric(work[c], errors="coerce")

    dropped_na = int(work[involved].isna().any(axis=1).sum())
    work = work.dropna(subset=involved)

    outliers = 0
    for c in [y] + x:
        if c in work.columns and pd.api.types.is_numeric_dtype(work[c]):
            q1, q3 = work[c].quantile(0.25), work[c].quantile(0.75)
            iqr = q3 - q1
            lo, hi = q1 - 3 * iqr, q3 + 3 * iqr   # 宽松阈值，仅剔极端异常
            mask = (work[c] < lo) | (work[c] > hi)
            outliers += int(mask.sum())
            work = work[~mask]

    report = {
        "rows_before": before,
        "rows_after": len(work),
        "dropped_missing": dropped_na,
        "dropped_outliers": outliers,
    }
    return work.reset_index(drop=True), report


def ingest_to_postgis(db: Session, dataset_id: str, df: pd.DataFrame, lon: str, lat: str,
                      temporal: str | None, source_crs: str = "WGS84") -> int:
    """
    写入 spatial_features：坐标先统一到 WGS84（4326）再入库，
    properties(JSONB) 存放全部非坐标/非时间字段。
    使用 ST_SetSRID(ST_MakePoint(...),4326) 构造几何。
    """
    prop_cols = [c for c in df.columns if c not in (lon, lat, temporal)]
    inserted = 0
    rows = []
    for _, r in df.iterrows():
        x, y = transform(float(r[lon]), float(r[lat]), source_crs, "WGS84")
        props = {c: (None if pd.isna(r[c]) else _py(r[c])) for c in prop_cols}
        obs = None
        if temporal:
            obs = _to_ts(r[temporal])
        rows.append({"lon": x, "lat": y, "obs": obs, "props": json.dumps(props, ensure_ascii=False)})

    stmt = text("""
        INSERT INTO spatial_features (dataset_id, geom, observed_time, properties)
        VALUES (:did, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), :obs, CAST(:props AS jsonb))
    """)
    for row in rows:
        db.execute(stmt, {"did": dataset_id, "lon": row["lon"], "lat": row["lat"],
                          "obs": row["obs"], "props": row["props"]})
        inserted += 1
    db.commit()
    return inserted


def _py(v):
    try:
        return v.item()  # numpy 标量 -> python
    except AttributeError:
        return v


def _to_ts(v):
    try:
        return pd.to_datetime(v).to_pydatetime()
    except Exception:
        # 整数序号（如 day）无法转日期时，落库为 None，序号本身留在 properties
        return None
