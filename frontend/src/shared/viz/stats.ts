/** 统计小工具。都是 O(n) 或 O(n log n), 不在主线程处理超过 2 万点的场景。 */

export function extent(values: number[]): [number, number] {
  let mn = Infinity; let mx = -Infinity;
  for (const v of values) { if (v < mn) mn = v; if (v > mx) mx = v; }
  return [mn, mx];
}

export function histogram(values: number[], bins = 24): [number, number][] {
  const [mn, mx] = extent(values);
  const step = (mx - mn) / bins || 1;
  const out: [number, number][] = Array.from({ length: bins }, (_, i) => [mn + i * step, 0]);
  for (const v of values) out[Math.min(bins - 1, Math.floor((v - mn) / step))]![1]++;
  return out;
}

/**
 * 指标方向归一化。
 *
 * 精度对比雷达图【必须】先过这一步。
 * R² 越大越好, RMSE/MAE/AICc 越小越好 —— 直接把四个原始值画进雷达图,
 * 得到的形状是误导性的: 差模型的 RMSE 大, 反而把雷达撑得更满。
 * 归一化后统一为"越靠外越好", 图形才和结论一致。
 */
export function normalizeMetric(
  value: number,
  all: number[],
  direction: 'higher_better' | 'lower_better',
): number {
  const valid = all.filter(Number.isFinite);
  if (!Number.isFinite(value) || valid.length === 0) return 0;
  const [mn, mx] = extent(valid);
  if (mx === mn) return 1;
  const t = (value - mn) / (mx - mn);
  return direction === 'higher_better' ? t : 1 - t;
}
