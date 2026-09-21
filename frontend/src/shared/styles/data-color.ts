/**
 * 数据色带的唯一出口。
 *
 * 硬规则: 色带、图例、系数带的任何颜色只能来自这里。
 * 用 Uno 原子类或组件内 hex 写数据色, 是图例与地图失同步的头号原因 ——
 * 因为改一处忘一处。
 */

export type RampKind = 'diverging' | 'sequential';

/** 发散色带: 青(负) → 零 → 赭(正)。蓝橙轴, 对红绿色觉障碍安全。
 *  两端明度都低、零点最高 —— 去色后仍呈"深—浅—深"。 */
const DIVERGING_LIGHT = [
  '#04463F', '#0A6259', '#178A80', '#5FB3AA', '#A9D4CE',
  '#EFE9DD',
  '#F0C79B', '#DE9A55', '#C2611D', '#95440F', '#652C07',
] as const;

const DIVERGING_DARK = [
  '#0B6259', '#12857A', '#2FA9A2', '#63C4BC', '#9BDBD4',
  '#2A3138',
  '#E8BE8C', '#E0873C', '#C96A22', '#A54F14', '#7A380C',
] as const;

/** 连续色带: 靛蓝单色明度阶。与发散带同屏时不会抢读。 */
const SEQUENTIAL_LIGHT = [
  '#EEF1F8', '#D3DAEB', '#B4BEDB', '#8F9DC7', '#6C7DAF',
  '#4E5F92', '#374673', '#2B3A67', '#1B2751', '#0B1436',
] as const;

const SEQUENTIAL_DARK = [
  '#101B33', '#1B2A4C', '#263A63', '#33497A', '#43598F',
  '#5A70A6', '#7789BC', '#96A5D0', '#B8C3E2', '#DCE3F2',
] as const;

export function ramp(kind: RampKind, theme: 'light' | 'dark'): readonly string[] {
  if (kind === 'diverging') return theme === 'dark' ? DIVERGING_DARK : DIVERGING_LIGHT;
  return theme === 'dark' ? SEQUENTIAL_DARK : SEQUENTIAL_LIGHT;
}

/**
 * 发散色带取色。零点【固定】映射到中间色, 不随数据范围漂移 ——
 * 否则一个全正的系数场会被涂成"有正有负"的样子, 这是严重误读。
 */
export function divergingColor(value: number, absMax: number, theme: 'light' | 'dark'): string {
  const colors = ramp('diverging', theme);
  const mid = (colors.length - 1) / 2;
  const t = absMax === 0 ? 0 : Math.max(-1, Math.min(1, value / absMax));
  return colors[Math.round(mid + t * mid)]!;
}

export function sequentialColor(value: number, min: number, max: number, theme: 'light' | 'dark'): string {
  const colors = ramp('sequential', theme);
  const t = max === min ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  return colors[Math.round(t * (colors.length - 1))]!;
}

/** 系数场取 |q05| 与 |q95| 的较大者作为对称上限, 避免离群点撑爆色带 */
export const symmetricMax = (q05: number, q95: number): number =>
  Math.max(Math.abs(q05), Math.abs(q95)) || 1;
