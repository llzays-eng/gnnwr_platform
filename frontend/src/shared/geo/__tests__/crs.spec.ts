import { describe, expect, it } from 'vitest';
import { coord, makeBuffer, offshoreRatio, looksSwapped, project, projectBuffer } from '../crs';

describe('坐标系转换', () => {
  it('境外坐标不做 GCJ-02 偏移（这是定义，不是简化）', () => {
    const tokyo = coord('WGS84', 139.6917, 35.6895);
    const g = project('WGS84', 'GCJ02', tokyo);
    expect(g[0]).toBeCloseTo(139.6917, 10);
    expect(g[1]).toBeCloseTo(35.6895, 10);
  });

  it('境内坐标偏移量在合理量级（数百米）', () => {
    const bj = coord('WGS84', 116.3974, 39.9093);
    const g = project('WGS84', 'GCJ02', bj);
    const dLng = Math.abs(g[0] - bj[0]);
    const dLat = Math.abs(g[1] - bj[1]);
    expect(dLng).toBeGreaterThan(0.001);
    expect(dLng).toBeLessThan(0.02);
    expect(dLat).toBeGreaterThan(0.001);
    expect(dLat).toBeLessThan(0.02);
  });

  it('往返转换误差小于 1 米（迭代反解的意义所在）', () => {
    const src = coord('WGS84', 121.4737, 31.2304);
    const back = project('GCJ02', 'WGS84', project('WGS84', 'GCJ02', src));
    // 1e-5 度 ≈ 1.1 米
    expect(Math.abs(back[0] - src[0])).toBeLessThan(1e-5);
    expect(Math.abs(back[1] - src[1])).toBeLessThan(1e-5);
  });

  it('同坐标系转换是恒等且不复制缓冲区', () => {
    const buf = makeBuffer('WGS84', new Float64Array([116, 39, 117, 40]));
    expect(projectBuffer('WGS84', buf)).toBe(buf);
  });

  it('批量转换不修改入参（避免同一份数据被转两次）', () => {
    const xy = new Float64Array([116.3974, 39.9093]);
    const buf = makeBuffer('WGS84', xy);
    projectBuffer('GCJ02', buf);
    expect(xy[0]).toBe(116.3974);
  });

  it('离岸哨兵能识别落在境外的点', () => {
    const off = makeBuffer('WGS84', new Float64Array([0, 0, 0, 0, 0, 0, 116, 39]));
    expect(offshoreRatio(off)).toBeGreaterThan(0.5);
    const on = makeBuffer('WGS84', new Float64Array([116, 39, 120, 31, 113, 23]));
    expect(offshoreRatio(on)).toBe(0);
  });

  it('能识别经纬度写反', () => {
    // 正常: (120, 31)。写反后 (31, 120) 落在境外
    const swapped = makeBuffer('WGS84', new Float64Array([31, 120, 30, 121, 32, 119]));
    expect(looksSwapped(swapped)).toBe(true);
    const normal = makeBuffer('WGS84', new Float64Array([120, 31, 121, 30, 119, 32]));
    expect(looksSwapped(normal)).toBe(false);
  });
});
