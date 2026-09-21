import type { FeatureId, TaskId } from './brand';
import type { GeoJsonPoint } from './spatial';

export type MetricKey = 'r2' | 'rmse' | 'mae' | 'aicc';

/**
 * 指标方向。
 *
 * 这个表存在的唯一理由: 精度对比雷达图必须先做方向归一化。
 * R² 越大越好, RMSE/MAE/AICc 越小越好 —— 直接把四个原始值画进雷达图,
 * 得到的形状是【误导性】的: 差模型的 RMSE 大, 反而把雷达图撑得更满。
 * 归一化实现见 dashboard/compare/normalize.ts。
 */
export const METRIC_DIRECTION: Readonly<Record<MetricKey, 'higher_better' | 'lower_better'>> =
  Object.freeze({
    r2: 'higher_better',
    rmse: 'lower_better',
    mae: 'lower_better',
    aicc: 'lower_better',
  });

export const METRIC_LABEL: Readonly<Record<MetricKey, string>> = Object.freeze({
  r2: 'R²',
  rmse: 'RMSE',
  mae: 'MAE',
  aicc: 'AICc',
});

export interface AccuracyMetrics {
  readonly r2: number;
  readonly rmse: number;
  readonly mae: number;
  readonly aicc: number;
}

/**
 * 单个自变量的系数分布摘要 —— 系数带(β-Ribbon)的数据源。
 *
 * 为什么要摘要而不是逐点系数: 10 万点 × 8 变量 = 80 万浮点数,
 * 一次性拉全会让浏览器卡死。摘要用于所有「概览」场景,
 * 逐点系数只在地图视野内按 bbox 增量取。
 */
export interface CoefficientSummary {
  readonly variable: string;
  readonly mean: number;
  readonly std: number;
  readonly min: number;
  readonly q05: number;
  readonly q25: number;
  readonly q50: number;
  readonly q75: number;
  readonly q95: number;
  readonly max: number;
  /** 系数为正的样本占比。0.5 附近意味着该变量的作用方向在空间上翻转 —— 平台最有价值的发现之一。 */
  readonly positive_ratio: number;
}

export interface ResidualSummary {
  readonly mean: number;
  readonly std: number;
  readonly min: number;
  readonly max: number;
  /** 直方图分箱, [下界, 计数][] */
  readonly histogram: readonly (readonly [number, number])[];
  /** Moran's I, 残差空间自相关。显著为正说明模型漏掉了空间结构。 */
  readonly morans_i: number | null;
}

/** GET /api/v1/models/tasks/{task_id}/result */
export interface ModelResult extends AccuracyMetrics {
  readonly task_id: TaskId;
  readonly coefficients_summary: readonly CoefficientSummary[];
  readonly residual_summary: ResidualSummary;
  readonly sample_count: number;
  /** 训练全过程的 loss, 用于刷新页面后补齐曲线 */
  readonly loss_history: readonly (readonly [epoch: number, train: number, val: number])[];
}

/**
 * 逐点系数与残差。
 * 阶段 0 假设: 后端提供按 bbox 分页的能力(协商清单 #3)。
 * 未提供时 useCoefficientField() 会降级为一次性拉取 + 前端抽样。
 */
export interface CoefficientPoint {
  readonly feature_id: FeatureId;
  readonly geom: GeoJsonPoint;
  /** 变量名 -> 该点的局部回归系数 */
  readonly coefficients: Readonly<Record<string, number>>;
  readonly local_r2: number | null;
  readonly residual: number;
  readonly observed: number;
  readonly predicted: number;
}

export type BaselineModelName = 'OLS' | 'GWR' | 'GTWR' | 'RandomForest';
export type ComparedModelName = BaselineModelName | 'GNNWR' | 'GTNNWR';

export const BASELINE_LABEL: Readonly<Record<ComparedModelName, string>> = Object.freeze({
  OLS: '普通最小二乘',
  GWR: '地理加权回归',
  GTWR: '地理时空加权回归',
  RandomForest: '随机森林',
  GNNWR: 'GNNWR (本模型)',
  GTNNWR: 'GTNNWR (本模型)',
});

export interface BaselineEntry extends AccuracyMetrics {
  readonly model: ComparedModelName;
  /** 是否为本次训练的模型 */
  readonly is_target: boolean;
  /**
   * 全局模型(OLS/随机森林)没有空间变系数, 此处为 null。
   * 系数带组件据此把它渲染成一根线而不是一条带 —— 这正是本平台的论证方式。
   */
  readonly coefficients_summary: readonly CoefficientSummary[] | null;
}

/** GET /api/v1/models/tasks/{task_id}/compare */
export interface BaselineComparison {
  readonly task_id: TaskId;
  readonly entries: readonly BaselineEntry[];
  /** 各指标的最优模型, 由后端判定, 前端不重算(避免与后端口径不一致) */
  readonly best_by_metric: Readonly<Record<MetricKey, ComparedModelName>>;
}
