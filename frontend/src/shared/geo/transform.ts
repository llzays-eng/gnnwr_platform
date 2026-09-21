/**
 * ⚠ 本文件是全项目【唯一】允许实现坐标变换数学的地方。
 * ESLint 的 no-restricted-imports 禁止 shared/geo 之外的任何文件引用它。
 * 需要转换请用 ./crs.ts 的 project() / toRenderCRS()。
 *
 * 算法: GCJ-02 加密偏移(俗称火星坐标)。国测局算法, 公开实现。
 * 反解用迭代逼近, 3 次迭代即可收敛到亚米级, 远优于常见的单次线性反解。
 */

const PI = Math.PI;
const A = 6378245.0; // 克拉索夫斯基椭球长半轴
const EE = 0.006_693_421_622_965_943; // 第一偏心率平方

/** 中国大陆粗略包络。境外坐标不做偏移 —— 这是 GCJ-02 的定义, 不是简化。 */
export function outOfChina(lng: number, lat: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number): number {
  let ret =
    -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

/** WGS84 -> GCJ02。写入 out 数组的 [oi], [oi+1]。 */
export function wgs84ToGcj02(lng: number, lat: number, out: Float64Array, oi: number): void {
  if (outOfChina(lng, lat)) {
    out[oi] = lng;
    out[oi + 1] = lat;
    return;
  }
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  out[oi] = lng + dLng;
  out[oi + 1] = lat + dLat;
}

/**
 * GCJ02 -> WGS84, 迭代逼近。
 * 常见的「加负偏移」单次反解在东部沿海有 1~2m 误差, 对本项目的
 * 站点级建模足够, 但对房价这种百米尺度分析不够 —— 所以用迭代。
 */
export function gcj02ToWgs84(lng: number, lat: number, out: Float64Array, oi: number): void {
  if (outOfChina(lng, lat)) {
    out[oi] = lng;
    out[oi + 1] = lat;
    return;
  }
  const tmp = new Float64Array(2);
  let wLng = lng;
  let wLat = lat;
  for (let i = 0; i < 3; i++) {
    wgs84ToGcj02(wLng, wLat, tmp, 0);
    wLng += lng - tmp[0]!;
    wLat += lat - tmp[1]!;
  }
  out[oi] = wLng;
  out[oi + 1] = wLat;
}

/**
 * CGCS2000 <-> WGS84。
 * 在本项目的精度需求(米级)下两者差异可忽略, 视作恒等变换。
 * 这个「等同」关系只在这里写一次, 不允许在调用处默认。
 */
export function identity(lng: number, lat: number, out: Float64Array, oi: number): void {
  out[oi] = lng;
  out[oi + 1] = lat;
}
