import dayjs from 'dayjs';

/**
 * 数值格式化。
 * 科学界面里小数点对不齐就是缺陷, 所以配套的 CSS 必须是 font-data + tabular-nums。
 */
export function num(v: number | null | undefined, digits = 3): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '-∞';
  if (v !== 0 && (Math.abs(v) < 1e-3 || Math.abs(v) >= 1e6)) return v.toExponential(2);
  return v.toFixed(digits);
}

/** 带正负号。系数展示必须显式带 +, 因为正负本身是结论。 */
export function signed(v: number | null | undefined, digits = 3): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return (v >= 0 ? '+' : '') + num(v, digits);
}

export function percent(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined || Number.isNaN(v) ? '—' : `${(v * 100).toFixed(digits)}%`;
}

export function bytes(n: number): string {
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

/** 秒 -> m:ss / h:mm:ss。训练已用时与预计剩余都用它, 保持同一读法。 */
export function duration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '计算中';
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (x: number) => String(x).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

/** 内存与运算一律 epoch 毫秒, 只在这里变成字符串。 */
export const fmtDate = (ms: number, pattern = 'YYYY-MM-DD'): string => dayjs(ms).format(pattern);
export const fmtDateTime = (ms: number): string => dayjs(ms).format('YYYY-MM-DD HH:mm:ss');
export const toEpoch = (iso: string): number => dayjs(iso).valueOf();
