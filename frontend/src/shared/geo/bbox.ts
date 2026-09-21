import type { BBox } from '../types/spatial';
import { coord, project, type CRS, type CoordBuffer } from './crs';

export function bboxOf(buf: CoordBuffer<CRS>): BBox {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (let i = 0; i < buf.xy.length; i += 2) {
    const x = buf.xy[i]!, y = buf.xy[i + 1]!;
    if (x < minLng) minLng = x;
    if (x > maxLng) maxLng = x;
    if (y < minLat) minLat = y;
    if (y > maxLat) maxLat = y;
  }
  return [minLng, minLat, maxLng, maxLat];
}

/** 按比例外扩。视野增量请求时预取一圈, 减少小幅拖动引发的请求。 */
export function expandBBox(b: BBox, ratio = 0.15): BBox {
  const dx = (b[2] - b[0]) * ratio;
  const dy = (b[3] - b[1]) * ratio;
  return [b[0] - dx, b[1] - dy, b[2] + dx, b[3] + dy];
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

/** 缓存键。量化到 4 位小数(约 10m), 避免像素级抖动导致缓存全失效。 */
export function bboxKey(b: BBox, zoom: number): string {
  const q = (n: number) => n.toFixed(4);
  return `${zoom}|${q(b[0])},${q(b[1])},${q(b[2])},${q(b[3])}`;
}

/**
 * 把轴对齐 bbox 的四角变换到目标 CRS, 再取包络。
 *
 * 只转西南/东北两角在 GCJ 偏移场里会漏掉另外两角的极值;
 * 查询与 fitBounds 都必须用四角包络, 否则边界附近会少取点或裁切不准。
 */
export function projectBBox<F extends CRS, T extends CRS>(from: F, to: T, b: BBox): BBox {
  if ((from as CRS) === (to as CRS)) return b;
  const corners: ReadonlyArray<readonly [number, number]> = [
    [b[0], b[1]],
    [b[0], b[3]],
    [b[2], b[1]],
    [b[2], b[3]],
  ];
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of corners) {
    const p = project(from, to, coord(from, lng, lat));
    if (p[0] < minLng) minLng = p[0];
    if (p[0] > maxLng) maxLng = p[0];
    if (p[1] < minLat) minLat = p[1];
    if (p[1] > maxLat) maxLat = p[1];
  }
  return [minLng, minLat, maxLng, maxLat];
}

/**
 * 适配器视口(渲染 CRS) → API 查询 bbox。
 * BBox 契约一律 WGS84, 高德 getBounds 拿到的是 GCJ-02, 必须在这里反投影。
 */
export function queryBBoxFromRenderViewport(renderCrs: CRS, bbox: BBox): BBox {
  return projectBBox(renderCrs, 'WGS84', bbox);
}

/**
 * 业务层 WGS84 fit → 适配器渲染 CRS。
 * 与点图层的 toRenderCRS / projectBuffer 同一条变换表。
 */
export function fitBBoxToRenderCrs(renderCrs: CRS, bbox: BBox): BBox {
  return projectBBox('WGS84', renderCrs, bbox);
}
