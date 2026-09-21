/**
 * 确定性随机。
 * 用固定种子的 PRNG 而非 Math.random, 是为了让 Mock 数据每次刷新都一样 ——
 * 演示时截图能复现, 调试时 bug 能复现, 测试断言能写死。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller, 生成正态分布 —— 残差与噪声用它才像真的 */
export function gaussian(rnd: () => number, mean = 0, std = 1): number {
  const u = 1 - rnd();
  const v = rnd();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const pick = <T>(rnd: () => number, arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;
export const between = (rnd: () => number, lo: number, hi: number): number => lo + rnd() * (hi - lo);
