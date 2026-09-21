import type { DatasetId, IsoDateTime, ProjectId } from './brand';

/** 后端计算一律在 WGS84/CGCS2000; GCJ02 只出现在用户声明的原始数据里。 */
export type SourceCRS = 'WGS84' | 'GCJ02' | 'CGCS2000';

export const CRS_LABEL: Readonly<Record<SourceCRS, string>> = Object.freeze({
  WGS84: 'WGS84 (GPS 原始坐标, 多数科研数据)',
  GCJ02: 'GCJ-02 (火星坐标, 国内地图厂商导出)',
  CGCS2000: 'CGCS2000 (国家大地坐标系, 官方测绘成果)',
});

export type DatasetFormat = 'csv' | 'excel' | 'geojson' | 'shapefile';

/** 数据集状态机。转移图见 shared/types/state-machine.ts */
export type DatasetStatus = 'uploaded' | 'cleaning' | 'cleaned' | 'ingested' | 'failed';

export type FieldKind = 'numeric' | 'integer' | 'text' | 'datetime' | 'boolean' | 'unknown';

export interface NumericFieldStats {
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly std: number;
  readonly q25: number;
  readonly q50: number;
  readonly q75: number;
}

export interface FieldSchema {
  readonly name: string;
  readonly kind: FieldKind;
  readonly missing_count: number;
  readonly missing_ratio: number;
  readonly distinct_count: number;
  /** 前几个非空样例值, 用于让用户肉眼确认类型推断对不对 */
  readonly sample_values: readonly unknown[];
  readonly stats: NumericFieldStats | null;
}

/**
 * 自动识别结果。
 * 关键约束: 这只是【建议】。用户的覆盖值存在 dataset store 的 overrides 里,
 * 两者分开存, 才能显示「你改了 2 处」并支持一键还原。
 */
export interface ColumnGuess {
  readonly longitude: string | null;
  readonly latitude: string | null;
  readonly temporal: string | null;
  /** 0~1。低于 0.6 时界面不应预选, 只应提示 */
  readonly confidence: number;
  readonly reason: string;
}

export interface DatasetStatusDetail {
  readonly code: string;
  readonly message: string;
  /** failed 状态必须给出可操作的下一步, 没有 next_actions 的失败态是设计缺陷 */
  readonly next_actions: readonly DatasetRecoveryAction[];
}

export type DatasetRecoveryAction =
  | { readonly kind: 'change_crs'; readonly suggested: SourceCRS }
  | { readonly kind: 'remap_columns' }
  | { readonly kind: 'reupload' }
  | { readonly kind: 'drop_invalid_rows'; readonly count: number }
  | { readonly kind: 'contact_admin' };

export interface Dataset {
  readonly id: DatasetId;
  readonly project_id: ProjectId;
  readonly filename: string;
  readonly format: DatasetFormat;
  readonly size_bytes: number;
  readonly row_count: number;
  readonly status: DatasetStatus;
  readonly status_detail: DatasetStatusDetail | null;
  /** 用户确认前为 null。null 时禁止进入建模向导。 */
  readonly source_crs: SourceCRS | null;
  readonly schema: readonly FieldSchema[];
  readonly column_guess: ColumnGuess;
  readonly created_at: IsoDateTime;
}

/** GET /api/v1/datasets/{id}/preview */
export interface DatasetPreview {
  readonly dataset_id: DatasetId;
  readonly total_rows: number;
  readonly columns: readonly string[];
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  /**
   * 地图分布抽样。经纬度按 dataset.source_crs 解释 ——
   * 渲染前先投影到 WGS84, 再交给 MapStage(内部 toRenderCRS)。
   *
   * 这是预览地图的【唯一】坐标通道。后端若另给 `points`(已是 GCJ-02,
   * 给高德直接打点的兼容字段), 前端不消费, 以免和 spatial_sample 混用。
   */
  readonly spatial_sample: readonly (readonly [number, number])[];
  /** 落在中国陆域边界外的比例。> 0.05 时界面直接提示坐标系可能选错。 */
  readonly offshore_ratio: number;
}

/** POST /api/v1/datasets/{id}/preprocess */
export interface PreprocessRequest {
  source_crs: SourceCRS;
  longitude_column: string;
  latitude_column: string;
  temporal_column?: string;
  drop_invalid_rows: boolean;
}
