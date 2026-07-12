"""
坐标系转换（大纲 7.1）
=====================
后端统一用 WGS84 / CGCS2000 做 GNNWR 计算，仅在**渲染前**纠偏为高德底图所需的
GCJ-02，避免"算得准但显示偏"。所有入库/出库环节都显式声明当前坐标系，
防止多次转换叠加误差。

* WGS84 ↔ CGCS2000：在通用地理分析精度下可视为一致（差异 < 数厘米），直接透传。
* WGS84 ↔ GCJ-02：中国大陆加密偏移（"火星坐标"），实现标准纠偏算法。
* 国外坐标不做加密（out_of_china 判定）。
"""
from __future__ import annotations

import math

_A = 6378245.0          # 克拉索夫斯基椭球长半轴
_EE = 0.00669342162296594323  # 偏心率平方
_PI = math.pi
_X_PI = _PI * 3000.0 / 180.0


def _out_of_china(lon: float, lat: float) -> bool:
    return not (72.004 <= lon <= 137.8347 and 0.8293 <= lat <= 55.8271)


def _transform_lat(x: float, y: float) -> float:
    ret = (-100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y
           + 0.2 * math.sqrt(abs(x)))
    ret += (20.0 * math.sin(6.0 * x * _PI) + 20.0 * math.sin(2.0 * x * _PI)) * 2.0 / 3.0
    ret += (20.0 * math.sin(y * _PI) + 40.0 * math.sin(y / 3.0 * _PI)) * 2.0 / 3.0
    ret += (160.0 * math.sin(y / 12.0 * _PI) + 320 * math.sin(y * _PI / 30.0)) * 2.0 / 3.0
    return ret


def _transform_lon(x: float, y: float) -> float:
    ret = (300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y
           + 0.1 * math.sqrt(abs(x)))
    ret += (20.0 * math.sin(6.0 * x * _PI) + 20.0 * math.sin(2.0 * x * _PI)) * 2.0 / 3.0
    ret += (20.0 * math.sin(x * _PI) + 40.0 * math.sin(x / 3.0 * _PI)) * 2.0 / 3.0
    ret += (150.0 * math.sin(x / 12.0 * _PI) + 300.0 * math.sin(x / 30.0 * _PI)) * 2.0 / 3.0
    return ret


def wgs84_to_gcj02(lon: float, lat: float) -> tuple[float, float]:
    """WGS84 → GCJ-02（用于把计算结果纠偏到高德底图）。"""
    if _out_of_china(lon, lat):
        return lon, lat
    dlat = _transform_lat(lon - 105.0, lat - 35.0)
    dlon = _transform_lon(lon - 105.0, lat - 35.0)
    radlat = lat / 180.0 * _PI
    magic = math.sin(radlat)
    magic = 1 - _EE * magic * magic
    sqrtmagic = math.sqrt(magic)
    dlat = (dlat * 180.0) / ((_A * (1 - _EE)) / (magic * sqrtmagic) * _PI)
    dlon = (dlon * 180.0) / (_A / sqrtmagic * math.cos(radlat) * _PI)
    return lon + dlon, lat + dlat


def gcj02_to_wgs84(lon: float, lat: float) -> tuple[float, float]:
    """GCJ-02 → WGS84（用于把高德采集的数据纠偏回真实坐标后入库计算）。"""
    if _out_of_china(lon, lat):
        return lon, lat
    glon, glat = wgs84_to_gcj02(lon, lat)
    return lon * 2 - glon, lat * 2 - glat


def transform(lon: float, lat: float, src: str, dst: str) -> tuple[float, float]:
    """
    统一入口。支持 WGS84 / CGCS2000 / GCJ-02。
    CGCS2000 与 WGS84 在本平台精度需求下视为等价。
    """
    src = _normalize(src)
    dst = _normalize(dst)
    if src == dst:
        return lon, lat
    # 先统一到 WGS84
    if src == "GCJ-02":
        lon, lat = gcj02_to_wgs84(lon, lat)
    # 再转到目标
    if dst == "GCJ-02":
        return wgs84_to_gcj02(lon, lat)
    return lon, lat


def _normalize(crs: str) -> str:
    c = crs.strip().upper().replace("_", "-")
    if c in ("WGS84", "WGS-84", "EPSG:4326", "4326"):
        return "WGS84"
    if c in ("CGCS2000", "CGCS-2000", "EPSG:4490", "4490"):
        return "WGS84"  # 精度需求下等价透传
    if c in ("GCJ-02", "GCJ02", "AMAP", "GAODE"):
        return "GCJ-02"
    return "WGS84"
