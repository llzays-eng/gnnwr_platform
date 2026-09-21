import type { IsoDateTime, ProjectId, UserId } from './brand';

/**
 * 场景类型。
 *
 * 重要边界: scenario_type 只允许影响【默认值与文案】,
 * 绝不允许影响【字段解析逻辑】。
 * 想按场景 if/else 解析列名的时候, 回来读这行注释。
 */
export type ScenarioType = 'air_quality' | 'housing_price' | 'custom';

export const SCENARIO_LABEL: Readonly<Record<ScenarioType, string>> = Object.freeze({
  air_quality: '大气污染物浓度反演',
  housing_price: '住宅价格空间分异',
  custom: '自定义场景',
});

export interface Project {
  readonly id: ProjectId;
  readonly name: string;
  readonly description: string;
  readonly scenario_type: ScenarioType;
  readonly owner_id: UserId;
  readonly created_at: IsoDateTime;
  readonly updated_at: IsoDateTime;
  /** 只读演示项目。游客可见, 任何人不可写。 */
  readonly is_demo: boolean;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  scenario_type: ScenarioType;
}
