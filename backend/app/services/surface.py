"""
曲面切片渲染。

计算侧系数点是 WGS84。前端高德底图是 GCJ-02，栅格无法逐点纠偏，
因此本服务把 XYZ / WMS 的经纬度解释为 GCJ-02：像素 lon/lat → 反解 WGS84 → IDW 采样。
响应必须带 tile_crs='GCJ02'（如实声明）。
WMS TIME 维度：当前不支持（time_dimension 仅回放点层时间轴）。

性能约束（P1-1）：
- 单次渲染像素数有硬上限 MAX_RENDER_PX × MAX_RENDER_PX，接口层另有 Query 校验；
- 坐标反解、IDW（KD-tree 批量近邻）、上色（查表）全部向量化，没有逐像素 Python 循环；
- 每个任务的 KD-tree 与色阶范围按 task 缓存，XYZ 瓦片 PNG 按 (task, z, x, y) 缓存。
  任务结果写入后不再变化，task_id 唯一，所以缓存无需失效逻辑。
"""
from __future__ import annotations

import io
import json
import math
from dataclasses import dataclass
from functools import lru_cache

import numpy as np
from PIL import Image
from sklearn.neighbors import KDTree

from app.core.config import settings
from app.services.crs_transform import gcj02_to_wgs84_np, wgs84_to_gcj02_np
from app.services.storage import storage

MAX_RENDER_PX = 1024
MAX_TILE_ZOOM = 22
_MAX_GRID = 256
_IDW_K = 12
_IDW_POWER = 2.0
_ALPHA = 200

_VIRIDIS = [
    (68, 1, 84), (72, 40, 120), (62, 74, 137), (49, 104, 142),
    (38, 130, 142), (31, 158, 137), (53, 183, 121), (109, 205, 89),
    (180, 222, 44), (253, 231, 37),
]


def _colormap(t: float) -> tuple[int, int, int, int]:
    t = min(1.0, max(0.0, t))
    x = t * (len(_VIRIDIS) - 1)
    i = int(x)
    f = x - i
    if i >= len(_VIRIDIS) - 1:
        r, g, b = _VIRIDIS[-1]
    else:
        a, c = _VIRIDIS[i], _VIRIDIS[i + 1]
        r = int(a[0] + (c[0] - a[0]) * f)
        g = int(a[1] + (c[1] - a[1]) * f)
        b = int(a[2] + (c[2] - a[2]) * f)
    return r, g, b, _ALPHA


# 256 级查表：灰度 i 对应 _colormap(i / 255)，与旧的逐像素实现逐值一致。
_LUT = np.array([_colormap(i / 255.0) for i in range(256)], dtype=np.uint8)


def _load_points(task_id: str) -> dict:
    key = f"results/{task_id}/coefficients.json"
    raw = json.loads(storage.get_bytes(key).decode("utf-8"))
    pts = raw.get("points") or []
    lons = np.array([p["lon"] for p in pts], float)
    lats = np.array([p["lat"] for p in pts], float)
    cols = raw.get("columns") or (list(pts[0]["coef"].keys()) if pts else [])
    primary = cols[0] if cols else "intercept"
    vals = np.array([p.get("coef", {}).get(primary, 0.0) for p in pts], float)
    return {
        "lons": lons, "lats": lats, "vals": vals, "primary": primary,
        "times": raw.get("times") or [], "temporal": bool(raw.get("temporal")),
        "n": len(pts),
    }


@lru_cache(maxsize=32)
def load_points_cached(task_id: str) -> dict:
    d = _load_points(task_id)
    # ndarray 不能进 lru 返回后被原地改，这里缓存文件解析结果的 python 列表。
    return {
        "lons": d["lons"].tolist(),
        "lats": d["lats"].tolist(),
        "vals": d["vals"].tolist(),
        "primary": d["primary"],
        "times": d["times"],
        "temporal": d["temporal"],
        "n": d["n"],
    }


@dataclass(frozen=True)
class _SurfaceModel:
    n: int
    tree: KDTree | None
    vals: np.ndarray
    vmin: float
    vmax: float


@lru_cache(maxsize=16)
def _surface_model(task_id: str) -> _SurfaceModel:
    d = load_points_cached(task_id)
    vals = np.asarray(d["vals"], float)
    vals.setflags(write=False)
    if d["n"] == 0:
        return _SurfaceModel(0, None, vals, 0.0, 1e-6)
    pts = np.column_stack([np.asarray(d["lons"], float), np.asarray(d["lats"], float)])
    vmin, vmax = float(np.nanpercentile(vals, 5)), float(np.nanpercentile(vals, 95))
    if abs(vmax - vmin) < 1e-9:
        vmax = vmin + 1e-6
    return _SurfaceModel(d["n"], KDTree(pts), vals, vmin, vmax)


def field_bbox_gcj02(task_id: str) -> list[float]:
    d = load_points_cached(task_id)
    if not d["n"]:
        return [73.0, 18.0, 135.0, 54.0]
    xs, ys = wgs84_to_gcj02_np(d["lons"], d["lats"])
    pad = 0.02
    return [float(xs.min()) - pad, float(ys.min()) - pad,
            float(xs.max()) + pad, float(ys.max()) + pad]


def _idw_batch(model: _SurfaceModel, qlon: np.ndarray, qlat: np.ndarray) -> np.ndarray:
    """对一批查询点做 k 近邻 IDW。语义与旧的逐点 _idw 相同：
    取最近 k 个点（总数不足 k 时取全部），命中样本点（距离 < 1e-9）时直接返回该点值。"""
    k = min(_IDW_K, model.n)
    q = np.column_stack([qlon.ravel(), qlat.ravel()])
    dist, idx = model.tree.query(q, k=k)  # 按距离升序
    near = model.vals[idx]
    w = 1.0 / np.power(dist + 1e-12, _IDW_POWER)
    out = np.sum(w * near, axis=1) / np.sum(w, axis=1)
    hit = dist[:, 0] < 1e-9
    out[hit] = near[hit, 0]
    return out.reshape(qlon.shape)


def _empty_png(width: int, height: int) -> bytes:
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def render_bbox_png(task_id: str, min_lon: float, min_lat: float,
                    max_lon: float, max_lat: float, width=256, height=256,
                    tile_crs: str = "GCJ02") -> bytes:
    # 接口层已校验；这里再兜底一次，防止内部调用传入超大尺寸。
    width = max(1, min(int(width), MAX_RENDER_PX))
    height = max(1, min(int(height), MAX_RENDER_PX))
    model = _surface_model(task_id)
    if model.n == 0:
        return _empty_png(width, height)

    # 先在降采样网格上插值再双线性放大。≥256 宽时步长 2（与旧实现一致）；
    # 更大的图把插值网格限制在约 _MAX_GRID 边长，单次请求的计算量与输出尺寸脱钩。
    step = max(1 if width < 256 else 2, math.ceil(max(width, height) / _MAX_GRID))
    xs = np.linspace(min_lon, max_lon, width)[::step]
    ys = np.linspace(max_lat, min_lat, height)[::step]  # 图像 y 向下
    gx, gy = np.meshgrid(xs, ys)
    if tile_crs.upper() in ("GCJ02", "GCJ-02"):
        gx, gy = gcj02_to_wgs84_np(gx, gy)
    grid = _idw_batch(model, gx, gy)
    grid = np.nan_to_num(grid, nan=model.vmin)

    gray = ((np.clip(grid, model.vmin, model.vmax) - model.vmin)
            / (model.vmax - model.vmin) * 255).astype(np.uint8)
    gimg = Image.fromarray(gray, mode="L").resize((width, height), Image.BILINEAR)
    pixels = _LUT[np.asarray(gimg, dtype=np.uint8)]
    img = Image.fromarray(pixels, "RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def xyz_to_bbox_lonlat(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    """Web Mercator 瓦片 → 经纬度 bbox（后续按 tile_crs 解释）。"""
    n = 2 ** z
    min_lon = x / n * 360.0 - 180.0
    max_lon = (x + 1) / n * 360.0 - 180.0

    def lat(y_):
        rad = math.pi * (1 - 2 * y_ / n)
        return math.degrees(math.atan(math.sinh(rad)))

    max_lat = lat(y)
    min_lat = lat(y + 1)
    return min_lon, min_lat, max_lon, max_lat


def valid_tile(z: int, x: int, y: int) -> bool:
    if not 0 <= z <= MAX_TILE_ZOOM:
        return False
    n = 2 ** z
    return 0 <= x < n and 0 <= y < n


@lru_cache(maxsize=512)
def render_xyz(task_id: str, z: int, x: int, y: int) -> bytes:
    """XYZ 瓦片（结果按 task/z/x/y 进程内缓存；地图来回平移不会重复渲染）。"""
    min_lon, min_lat, max_lon, max_lat = xyz_to_bbox_lonlat(z, x, y)
    return render_bbox_png(
        task_id, min_lon, min_lat, max_lon, max_lat,
        tile_crs=settings.SURFACE_TILE_CRS,
    )


def legend_png(task_id: str, width=24, height=128) -> bytes:
    load_points_cached(task_id)  # 结果不存在时与旧行为一致地抛错
    t = 1.0 - np.arange(height) / max(height - 1, 1)
    rows = np.array([_colormap(float(v)) for v in t], dtype=np.uint8)
    pixels = np.repeat(rows[:, None, :], width, axis=1)
    img = Image.fromarray(pixels, "RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
