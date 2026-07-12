// 发散/顺序色标：与独立看板保持一致，暗色背景下可读。
// 变量取值跨 0 时用「蓝—中性—橙」发散并以 0 为中心；否则用青色顺序标尺。
const NEG = [78, 147, 222], MIDN = [74, 86, 99], POS = [235, 122, 84]
const SEQ0 = [40, 70, 86], SEQ1 = [52, 209, 190]

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const toHex = (c: number[]) =>
  '#' + c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')

export function colorFor(v: number, lo: number, hi: number, spans0: boolean): string {
  if (spans0) {
    const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1
    const t = Math.max(-1, Math.min(1, v / m))
    if (t < 0) { const k = t + 1; return toHex([lerp(NEG[0], MIDN[0], k), lerp(NEG[1], MIDN[1], k), lerp(NEG[2], MIDN[2], k)]) }
    return toHex([lerp(MIDN[0], POS[0], t), lerp(MIDN[1], POS[1], t), lerp(MIDN[2], POS[2], t)])
  }
  const t = Math.max(0, Math.min(1, (v - lo) / ((hi - lo) || 1)))
  return toHex([lerp(SEQ0[0], SEQ1[0], t), lerp(SEQ0[1], SEQ1[1], t), lerp(SEQ0[2], SEQ1[2], t)])
}

export function cbarGradient(lo: number, hi: number, spans0: boolean): string {
  const n = 24, stops: string[] = []
  for (let i = 0; i <= n; i++) {
    const v = lo + ((hi - lo) * i) / n
    stops.push(colorFor(v, lo, hi, spans0) + ' ' + ((100 * i) / n).toFixed(0) + '%')
  }
  return 'linear-gradient(90deg,' + stops.join(',') + ')'
}

// 由一组数值给出 2~98 分位裁剪范围，避免极端值压扁色标
export function robustRange(vals: number[]): [number, number] {
  const s = [...vals].sort((a, b) => a - b)
  const q = (p: number) => s[Math.max(0, Math.min(s.length - 1, Math.floor(p * (s.length - 1))))]
  return [q(0.02), q(0.98)]
}

export const FIELD_LABELS: Record<string, string> = {
  intercept: '截距', area: '建筑面积', age: '楼龄', floor_ratio: '容积率', green_ratio: '绿化率',
  dist_subway: '地铁邻近性', dist_cbd: '到CBD距离', school_score: '学区评分', poi_density: 'POI密度',
  aod: '气溶胶AOD', temp: '气温', humidity: '相对湿度', wind: '风速', blh: '边界层高度',
  dem: '高程', ntl: '夜间灯光',
}
