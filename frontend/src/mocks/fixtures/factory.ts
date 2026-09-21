import type {
  AccuracyMetrics, BaselineComparison, BaselineEntry, CoefficientSummary,
  ComparedModelName, FieldSchema, ModelResult, ResidualSummary, TaskId,
} from '@shared/types';
import { asId } from '@shared/types';
import { gaussian, mulberry32 } from './rng';

/**
 * 夹具工厂。
 *
 * 关键: 这些函数的返回类型就是 types/ 里的真实类型。
 * 后端契约一变, 类型一改, 这里立刻编译报错 ——
 * 这是「用类型当唯一真相」防契约漂移的具体做法。
 */

export function fieldSchema(
  name: string,
  kind: FieldSchema['kind'],
  opts: Partial<FieldSchema> = {},
): FieldSchema {
  return {
    name,
    kind,
    missing_count: 0,
    missing_ratio: 0,
    distinct_count: 100,
    sample_values: [],
    stats: null,
    ...opts,
  };
}

/** 从一组样本值生成分位数摘要 —— 系数带的数据源 */
export function summarize(variable: string, values: number[]): CoefficientSummary {
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const std = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length);
  return {
    variable,
    mean, std,
    min: s[0]!, max: s[s.length - 1]!,
    q05: q(0.05), q25: q(0.25), q50: q(0.5), q75: q(0.75), q95: q(0.95),
    positive_ratio: s.filter((v) => v > 0).length / s.length,
  };
}

export function residualSummary(residuals: number[]): ResidualSummary {
  const min = Math.min(...residuals);
  const max = Math.max(...residuals);
  const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  const std = Math.sqrt(residuals.reduce((a, b) => a + (b - mean) ** 2, 0) / residuals.length);
  const bins = 24;
  const step = (max - min) / bins || 1;
  const hist: [number, number][] = Array.from({ length: bins }, (_, i) => [min + i * step, 0]);
  for (const r of residuals) {
    const i = Math.min(bins - 1, Math.floor((r - min) / step));
    hist[i]![1]++;
  }
  return { mean, std, min, max, histogram: hist, morans_i: 0.12 };
}

export function lossHistory(epochs: number, seed = 7): [number, number, number][] {
  const rnd = mulberry32(seed);
  const out: [number, number, number][] = [];
  for (let e = 1; e <= epochs; e++) {
    // 指数衰减 + 噪声; 验证集在后段略微抬头, 制造早停的真实感
    const base = 0.9 * Math.exp(-e / (epochs * 0.28)) + 0.06;
    const train = base + Math.abs(gaussian(rnd, 0, 0.006));
    const val = base * 1.08 + Math.abs(gaussian(rnd, 0, 0.011)) + (e > epochs * 0.75 ? (e - epochs * 0.75) * 0.00018 : 0);
    out.push([e, Number(train.toFixed(5)), Number(val.toFixed(5))]);
  }
  return out;
}

/**
 * 基线对比。
 * 刻意让 OLS 的 coefficients_summary 为 null —— 全局模型没有空间变系数,
 * 系数带组件会把它渲染成一根线。这个 null 不是数据缺失, 是结论本身。
 */
export function comparison(
  taskId: TaskId,
  target: ComparedModelName,
  targetMetrics: AccuracyMetrics,
  targetCoef: CoefficientSummary[],
  globalCoef: CoefficientSummary[],
): BaselineComparison {
  const entries: BaselineEntry[] = [
    { model: target, is_target: true, ...targetMetrics, coefficients_summary: targetCoef },
    { model: 'OLS', is_target: false, r2: targetMetrics.r2 * 0.68, rmse: targetMetrics.rmse * 1.62, mae: targetMetrics.mae * 1.55, aicc: targetMetrics.aicc * 1.18, coefficients_summary: globalCoef },
    { model: 'GWR', is_target: false, r2: targetMetrics.r2 * 0.91, rmse: targetMetrics.rmse * 1.19, mae: targetMetrics.mae * 1.16, aicc: targetMetrics.aicc * 1.06, coefficients_summary: targetCoef.map((c) => ({ ...c, q05: c.q05 * 0.7, q95: c.q95 * 0.7 })) },
    { model: 'GTWR', is_target: false, r2: targetMetrics.r2 * 0.94, rmse: targetMetrics.rmse * 1.12, mae: targetMetrics.mae * 1.1, aicc: targetMetrics.aicc * 1.04, coefficients_summary: targetCoef.map((c) => ({ ...c, q05: c.q05 * 0.8, q95: c.q95 * 0.8 })) },
    { model: 'RandomForest', is_target: false, r2: targetMetrics.r2 * 0.96, rmse: targetMetrics.rmse * 1.05, mae: targetMetrics.mae * 1.02, aicc: NaN, coefficients_summary: null },
  ];
  return {
    task_id: taskId,
    entries,
    best_by_metric: { r2: target, rmse: target, mae: target, aicc: target },
  };
}

export function modelResult(
  taskId: string,
  metrics: AccuracyMetrics,
  coef: CoefficientSummary[],
  residuals: number[],
  sampleCount: number,
  epochs: number,
): ModelResult {
  return {
    task_id: asId<TaskId>(taskId),
    ...metrics,
    coefficients_summary: coef,
    residual_summary: residualSummary(residuals),
    sample_count: sampleCount,
    loss_history: lossHistory(epochs),
  };
}
