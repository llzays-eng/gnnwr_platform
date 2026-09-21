import type { ColumnGuess, FieldSchema, SourceCRS } from '@shared/types';

/**
 * 经纬度 / 时间候选列识别。
 *
 * 这【不是】按场景写死解析 —— 只看列名与取值范围，对大气、房价、
 * 以及第三份陌生数据一视同仁。禁止事项 1 的边界在于:
 * 不得出现 `if (scenario === 'air_quality')`。
 */
const LNG = ['lng', 'lon', 'long', 'longitude', 'x', '经度'];
const LAT = ['lat', 'latitude', 'y', '纬度'];
const TIME = ['date', 'time', 'datetime', 'timestamp', 'observed_time', 'dt', '日期', '时间'];

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]/g, '');

function scoreName(name: string, dict: string[]): number {
  const n = norm(name);
  if (dict.some((d) => norm(d) === n)) return 1;
  if (dict.some((d) => n.includes(norm(d)))) return 0.6;
  return 0;
}

const inRange = (f: FieldSchema, lo: number, hi: number): boolean =>
  f.stats !== null && f.stats.min >= lo && f.stats.max <= hi;

export function inferColumns(schema: readonly FieldSchema[]): ColumnGuess {
  const numeric = schema.filter((f) => f.kind === 'numeric' || f.kind === 'integer');

  const pick = (dict: string[], lo: number, hi: number): { name: string; score: number } | null => {
    const scored = numeric
      .map((f) => ({ name: f.name, score: scoreName(f.name, dict) + (inRange(f, lo, hi) ? 0.5 : -0.4) }))
      .filter((s) => s.score > 0.3)
      .sort((a, b) => b.score - a.score);
    return scored[0] ?? null;
  };

  const lng = pick(LNG, 73, 136);
  const lat = pick(LAT, 3, 54);
  const timeField = schema
    .map((f) => ({ f, s: scoreName(f.name, TIME) + (f.kind === 'datetime' ? 0.6 : 0) }))
    .filter((x) => x.s > 0.5)
    .sort((a, b) => b.s - a.s)[0]?.f ?? null;

  const conf = Math.min(1, ((lng?.score ?? 0) + (lat?.score ?? 0)) / 3);
  const reasons: string[] = [];
  reasons.push(lng && lat ? `列名 ${lng.name}/${lat.name} 匹配常见经纬度命名` : '未找到明确的经纬度列名');
  reasons.push(timeField ? `${timeField.name} 可解析为时间` : '未发现可解析为时间的列');

  return {
    longitude: lng?.name ?? null,
    latitude: lat?.name ?? null,
    temporal: timeField?.name ?? null,
    // 低于 0.6 时界面不预选、只提示 —— 猜错比不猜更糟
    confidence: Number(conf.toFixed(2)),
    reason: `${reasons.join('；')}。`,
  };
}

/** 由落点分布给出坐标系建议。经纬度写反与坐标系选错是最高频的致命错误。 */
export function suggestCrs(offshoreRatio: number, swapped: boolean): {
  level: 'ok' | 'warn' | 'error';
  message: string;
  suggest: SourceCRS | 'swap' | null;
} {
  if (swapped) {
    return { level: 'error', message: '点位几乎全部落在中国境外，交换经纬度后就落回陆地 —— 多半是两列写反了。', suggest: 'swap' };
  }
  if (offshoreRatio > 0.5) {
    return { level: 'error', message: `${Math.round(offshoreRatio * 100)}% 的点落在中国陆域之外。检查经纬度列是否选对、坐标系是否选错。`, suggest: 'GCJ02' };
  }
  if (offshoreRatio > 0.05) {
    return { level: 'warn', message: `${Math.round(offshoreRatio * 100)}% 的点落在陆域边界外。若数据本身含海上站点可忽略。`, suggest: null };
  }
  return { level: 'ok', message: '点位分布正常，未发现明显的坐标异常。', suggest: null };
}
