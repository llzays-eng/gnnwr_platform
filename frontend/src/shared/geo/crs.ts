import { gcj02ToWgs84, identity, outOfChina, wgs84ToGcj02 } from './transform';

/* ═══════════════════════════════════════════════════════════════
 * 坐标系纪律 —— 本项目最高风险项的类型层解法。
 *
 * 目标不是「记得转换」, 而是让漏转换【写不出来】:
 *   addPoints(wgsPoints)  →  编译错误, 而不是一张偏移 500 米的地图。
 *
 * 三道防线:
 *   1. 编译期 —— 本文件的品牌类型
 *   2. 构建期 —— eslint.config.js 的 no-restricted-imports
 *   3. 运行期 —— assertCrs (仅 dev) 与 offshoreRatio 离岸哨兵
 * ═══════════════════════════════════════════════════════════════ */

declare const CRS_TAG: unique symbol;

export type CRS = 'WGS84' | 'GCJ02' | 'CGCS2000';

/** 渲染层(高德底图)唯一接受的坐标系 */
export const RENDER_CRS = 'GCJ02' as const;
export type RenderCRS = typeof RENDER_CRS;

/**
 * 带坐标系标签的坐标。运行时就是 readonly [number, number], 零开销。
 */
export type Coord<C extends CRS> = readonly [lng: number, lat: number] & {
  readonly [CRS_TAG]: C;
};

/** 唯一构造入口: 必须显式声明这对数字是什么坐标系 */
export function coord<C extends CRS>(_crs: C, lng: number, lat: number): Coord<C> {
  return [lng, lat] as unknown as Coord<C>;
}

/** 从后端 GeoJSON 构造。后端一律 WGS84, 因此这里锁死类型参数。 */
export function coordFromGeoJson(c: readonly [number, number]): Coord<'WGS84'> {
  return [c[0], c[1]] as unknown as Coord<'WGS84'>;
}

type Fn = (lng: number, lat: number, out: Float64Array, oi: number) => void;

const TABLE: Record<CRS, Record<CRS, Fn>> = {
  WGS84: { WGS84: identity, GCJ02: wgs84ToGcj02, CGCS2000: identity },
  GCJ02: { WGS84: gcj02ToWgs84, GCJ02: identity, CGCS2000: gcj02ToWgs84 },
  CGCS2000: { WGS84: identity, GCJ02: wgs84ToGcj02, CGCS2000: identity },
};

/** 唯一转换入口(标量) */
export function project<F extends CRS, T extends CRS>(from: F, to: T, c: Coord<F>): Coord<T> {
  const out = new Float64Array(2);
  TABLE[from][to](c[0], c[1], out, 0);
  return [out[0]!, out[1]!] as unknown as Coord<T>;
}

/** 语义化快捷方式: 任何坐标进渲染层前的最后一站 */
export function toRenderCRS<F extends CRS>(from: F, c: Coord<F>): Coord<RenderCRS> {
  return project(from, RENDER_CRS, c);
}

/* ─────────────────────────────────────────────────────────────
 * 批量路径。
 * 10 万个品牌元组的内存与 GC 开销不可接受, 批量数据一律用
 * 结构数组 + 类型标签: 编译期安全靠 crs 字段, 性能靠 Float64Array。
 * ───────────────────────────────────────────────────────────── */

export interface CoordBuffer<C extends CRS> {
  readonly crs: C;
  /** [lng, lat, lng, lat, ...], 长度 = count * 2 */
  readonly xy: Float64Array;
  readonly count: number;
}

export function makeBuffer<C extends CRS>(crs: C, xy: Float64Array): CoordBuffer<C> {
  if (xy.length % 2 !== 0) throw new Error(`坐标缓冲区长度必须为偶数, 收到 ${xy.length}`);
  return { crs, xy, count: xy.length / 2 };
}

/**
 * 批量转换。返回新缓冲区, 不修改入参 —— 就地修改会让同一份数据
 * 在不同图层间被转换两次, 这正是「多次转换叠加误差」的成因。
 *
 * 10 万点以上请走 geo/worker.ts 的 Worker 版本, 主线程不要跑。
 */
export function projectBuffer<F extends CRS, T extends CRS>(
  to: T,
  buf: CoordBuffer<F>,
): CoordBuffer<T> {
  if ((buf.crs as CRS) === (to as CRS)) return buf as unknown as CoordBuffer<T>;
  const fn = TABLE[buf.crs][to];
  const out = new Float64Array(buf.xy.length);
  for (let i = 0; i < buf.xy.length; i += 2) {
    fn(buf.xy[i]!, buf.xy[i + 1]!, out, i);
  }
  return { crs: to, xy: out, count: buf.count };
}

/* ─────────── 运行期防线 ─────────── */

/** dev 断言。生产构建下被 tree-shake 掉。 */
export function assertCrs<C extends CRS>(buf: CoordBuffer<CRS>, expected: C): asserts buf is CoordBuffer<C> {
  if (import.meta.env.DEV && buf.crs !== expected) {
    throw new Error(`坐标系不匹配: 期望 ${expected}, 实际 ${buf.crs}。请检查是否漏了 projectBuffer()。`);
  }
}

/**
 * 离岸哨兵。
 * 坐标系选错的典型症状是点全部落进几内亚湾(经纬度写反)或整体偏移。
 * 抽样比全量快得多, 200 个点足以判断。
 */
export function offshoreRatio(buf: CoordBuffer<CRS>, sampleSize = 200): number {
  const step = Math.max(1, Math.floor(buf.count / sampleSize));
  let checked = 0;
  let bad = 0;
  for (let i = 0; i < buf.count; i += step) {
    const lng = buf.xy[i * 2]!;
    const lat = buf.xy[i * 2 + 1]!;
    checked++;
    if (outOfChina(lng, lat)) bad++;
  }
  return checked === 0 ? 0 : bad / checked;
}

/** 经纬度是否写反的启发式: 交换后离岸率显著下降, 就是写反了。 */
export function looksSwapped(buf: CoordBuffer<CRS>): boolean {
  const swapped = new Float64Array(buf.xy.length);
  for (let i = 0; i < buf.xy.length; i += 2) {
    swapped[i] = buf.xy[i + 1]!;
    swapped[i + 1] = buf.xy[i]!;
  }
  const before = offshoreRatio(buf);
  const after = offshoreRatio({ crs: buf.crs, xy: swapped, count: buf.count });
  return before > 0.3 && after < before / 3;
}

export { outOfChina };
