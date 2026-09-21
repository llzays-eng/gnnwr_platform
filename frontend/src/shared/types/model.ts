import type { DatasetId, IsoDateTime, ProjectId, TaskId } from './brand';

export type ModelType = 'GNNWR' | 'GTNNWR';

export const MODEL_TYPE_META: Readonly<
  Record<ModelType, { label: string; oneLiner: string; requiresTemporal: boolean }>
> = Object.freeze({
  GNNWR: {
    label: 'GNNWR · 空间模式',
    oneLiner: '只看「在哪」。同一个因素在不同地点的影响不同, 但不随时间变化。',
    requiresTemporal: false,
  },
  GTNNWR: {
    label: 'GTNNWR · 时空模式',
    oneLiner: '同时看「在哪」和「什么时候」。影响会随地点和时间一起变, 需要时间列。',
    requiresTemporal: true,
  },
});

export type ActivationFn = 'relu' | 'leaky_relu' | 'tanh' | 'sigmoid' | 'elu';

/**
 * 每个超参数都要带一句人话与推荐值 —— 目标用户看得懂 R², 但没义务懂 dropout。
 * 这份元数据是向导第 4、5 步文案的唯一来源, 不允许在组件里另写一份。
 */
export interface HyperparamMeta {
  readonly label: string;
  readonly plain: string;
  readonly recommended: number | string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export interface NetworkStructure {
  /** 每个元素是一层的神经元数。长度即层数。 */
  hidden_layers: number[];
  activation: ActivationFn;
  /** 0~0.9 */
  dropout: number;
}

export interface TrainingHyperparams {
  batch_size: number;
  max_epochs: number;
  learning_rate: number;
  early_stopping_patience: number;
}

/** 三段之和必须为 1(容差 1e-6), 校验在 modeling 规则引擎里 */
export interface DatasetSplit {
  train: number;
  val: number;
  test: number;
}

export interface ModelHyperparams extends NetworkStructure, TrainingHyperparams {
  split: DatasetSplit;
  random_seed: number;
}

export type TaskStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';

export interface TaskProgress {
  readonly epoch: number;
  readonly total_epochs: number;
  readonly train_loss: number;
  readonly val_loss: number;
  readonly elapsed_s: number;
  /** 后端算不出时为 null。前端不要自己瞎猜剩余时间, 宁可显示「计算中」。 */
  readonly eta_s: number | null;
}

export interface TaskError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * 提交建模任务。字段名与 POST /api/v1/models/train 的契约严格对应。
 * spatial_columns 固定两元组 [经度列, 纬度列], 顺序不可颠倒。
 */
export interface TrainRequest {
  project_id: ProjectId;
  dataset_id: DatasetId;
  model_type: ModelType;
  y_column: string;
  x_columns: string[];
  spatial_columns: [string, string];
  /** GNNWR 模式必须为 null; GTNNWR 模式必须非空。校验见 modeling/validation */
  temporal_column: string | null;
  hyperparams: ModelHyperparams;
}

export interface ModelTask {
  readonly id: TaskId;
  readonly project_id: ProjectId;
  readonly dataset_id: DatasetId;
  readonly model_type: ModelType;
  readonly y_column: string;
  readonly x_columns: readonly string[];
  readonly spatial_columns: readonly [string, string];
  readonly temporal_column: string | null;
  readonly hyperparams: ModelHyperparams;
  readonly status: TaskStatus;
  readonly progress: TaskProgress | null;
  readonly error: TaskError | null;
  readonly created_at: IsoDateTime;
  readonly started_at: IsoDateTime | null;
  readonly finished_at: IsoDateTime | null;
}

/** 建模向导的完整配置。与 TrainRequest 的区别: 允许中间态(字段未选满)。 */
export interface WizardDraft {
  model_type: ModelType | null;
  y_column: string | null;
  x_columns: string[];
  longitude_column: string | null;
  latitude_column: string | null;
  temporal_column: string | null;
  split: DatasetSplit;
  network: NetworkStructure;
  training: TrainingHyperparams;
  random_seed: number;
}

/** 配置模板。后端无对应接口, 当前落 localStorage, 见协商清单 #6。 */
export interface ConfigTemplate {
  readonly id: string;
  readonly name: string;
  readonly created_at: IsoDateTime;
  /** 只存与数据集无关的部分, 换数据集也能复用 */
  readonly payload: Omit<WizardDraft, 'y_column' | 'x_columns' | 'longitude_column' | 'latitude_column' | 'temporal_column'>;
}
