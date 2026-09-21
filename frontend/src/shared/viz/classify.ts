export type ClassifyMethod = 'equal_interval' | 'quantile' | 'natural_breaks';

export const CLASSIFY_LABEL: Readonly<Record<ClassifyMethod, { label: string; plain: string }>> =
  Object.freeze({
    equal_interval: { label: '等间隔', plain: '按数值范围均分。看得出绝对差距，但极端值会把大部分点挤进同一级。' },
    quantile: { label: '分位数', plain: '每一级点数相同。看得清空间格局，但相邻级的实际差距可能很小。' },
    natural_breaks: { label: '自然断点', plain: '按数据自身的聚集情况分组。多数专题图的默认选择。' },
  });

const asc = (a: number, b: number) => a - b;

export function equalInterval(values: number[], k: number): number[] {
  const min = Math.min(...values); const max = Math.max(...values);
  const step = (max - min) / k;
  return Array.from({ length: k - 1 }, (_, i) => min + step * (i + 1));
}

export function quantile(values: number[], k: number): number[] {
  const s = [...values].sort(asc);
  return Array.from({ length: k - 1 }, (_, i) => s[Math.floor(((i + 1) / k) * s.length)] ?? s.at(-1)!);
}

/**
 * 自然断点。
 *
 * 完整 Jenks 是 O(n²k)，10 万点直接卡死主线程 —— 违反"不做大规模同步阻塞处理"。
 * 这里用 head/tail 抽样 + 一维 k-means(Lloyd) 逼近：抽样上限 2000 点，
 * 收敛或 30 次迭代即停。视觉上与 Jenks 几乎无差别，代价从秒级降到毫秒级。
 */
export function naturalBreaks(values: number[], k: number, sampleCap = 2000): number[] {
  const s = [...values].sort(asc);
  const step = Math.max(1, Math.floor(s.length / sampleCap));
  const sample = step === 1 ? s : s.filter((_, i) => i % step === 0);
  if (sample.length <= k) return quantile(values, k);

  let centers = Array.from({ length: k }, (_, i) => sample[Math.floor(((i + 0.5) / k) * sample.length)]!);
  for (let iter = 0; iter < 30; iter++) {
    const sums = new Float64Array(k); const counts = new Int32Array(k);
    for (const v of sample) {
      let best = 0; let bd = Infinity;
      for (let c = 0; c < k; c++) { const d = Math.abs(v - centers[c]!); if (d < bd) { bd = d; best = c; } }
      // 不用复合赋值: noUncheckedIndexedAccess 下 TypedArray 的读是 number|undefined
      sums[best] = sums[best]! + v;
      counts[best] = counts[best]! + 1;
    }
    const next = centers.map((c, i) => (counts[i] ? sums[i]! / counts[i]! : c));
    const moved = next.some((v, i) => Math.abs(v - centers[i]!) > 1e-9);
    centers = next;
    if (!moved) break;
  }
  centers.sort(asc);
  return Array.from({ length: k - 1 }, (_, i) => (centers[i]! + centers[i + 1]!) / 2);
}

export function classify(values: number[], method: ClassifyMethod, k: number): number[] {
  if (values.length === 0 || k < 2) return [];
  switch (method) {
    case 'equal_interval': return equalInterval(values, k);
    case 'quantile': return quantile(values, k);
    case 'natural_breaks': return naturalBreaks(values, k);
  }
}

/** 值 → 分级下标。图例与地图共用它, 从而不可能不一致。 */
export function classOf(value: number, breaks: number[]): number {
  let i = 0;
  while (i < breaks.length && value > breaks[i]!) i++;
  return i;
}
