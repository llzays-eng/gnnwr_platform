import { describe, expect, it } from 'vitest';
import { coord, project } from '../crs';
import { fitBBoxToRenderCrs, projectBBox, queryBBoxFromRenderViewport } from '../bbox';
import type { BBox } from '../../types/spatial';

describe('bbox CRS conversion', () => {
  it('同坐标系转换直接复用原对象', () => {
    const src: BBox = [120, 30, 121, 31];
    expect(projectBBox('WGS84', 'WGS84', src)).toBe(src);
  });

  it('fitBounds 与 viewport 查询在 GCJ02 路径上可往返到 WGS84', () => {
    const wgs: BBox = [121.35, 31.1, 121.55, 31.3];
    const render = fitBBoxToRenderCrs('GCJ02', wgs);
    const back = queryBBoxFromRenderViewport('GCJ02', render);
    // 包络往返后应包含原边界，且扩张需控制在可接受范围内（< 5e-4 度，约 55m）。
    expect(back[0]).toBeLessThanOrEqual(wgs[0]);
    expect(back[1]).toBeLessThanOrEqual(wgs[1]);
    expect(back[2]).toBeGreaterThanOrEqual(wgs[2]);
    expect(back[3]).toBeGreaterThanOrEqual(wgs[3]);
    expect(wgs[0] - back[0]).toBeLessThan(5e-4);
    expect(wgs[1] - back[1]).toBeLessThan(5e-4);
    expect(back[2] - wgs[2]).toBeLessThan(5e-4);
    expect(back[3] - wgs[3]).toBeLessThan(5e-4);
  });

  it('四角包络覆盖全部角点（不只看 SW/NE）', () => {
    const wgs: BBox = [113.8, 22.4, 114.6, 22.9];
    const box = projectBBox('WGS84', 'GCJ02', wgs);
    const corners: ReadonlyArray<readonly [number, number]> = [
      [wgs[0], wgs[1]],
      [wgs[0], wgs[3]],
      [wgs[2], wgs[1]],
      [wgs[2], wgs[3]],
    ];
    for (const [lng, lat] of corners) {
      const gcj = project('WGS84', 'GCJ02', coord('WGS84', lng, lat));
      expect(gcj[0]).toBeGreaterThanOrEqual(box[0]);
      expect(gcj[0]).toBeLessThanOrEqual(box[2]);
      expect(gcj[1]).toBeGreaterThanOrEqual(box[1]);
      expect(gcj[1]).toBeLessThanOrEqual(box[3]);
    }
  });
});
