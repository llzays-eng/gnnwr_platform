import type { DatasetId, FeatureId, IsoDateTime } from './brand';

/** [minLng, minLat, maxLng, maxLat], 一律 WGS84。
 * 高德视口的 GCJ-02 范围必须先经 queryBBoxFromRenderViewport() 再填进这里。
 */
export type BBox = readonly [number, number, number, number];

export interface GeoJsonPoint {
  readonly type: 'Point';
  readonly coordinates: readonly [number, number];
}

/**
 * 空间要素。
 *
 * properties 是动态字段: 大气场景是 pm25/aod/t2m/..., 房价场景是 price/area/...,
 * 自定义场景是任意集合。因此这里【必须】是 Record<string, unknown> 而不是联合类型 ——
 * 泛型参数 P 只给调用方在确知形状时窄化用, 平台代码一律用默认值。
 *
 * 禁止事项 1 的类型层落实: 任何 `if (scenario === 'air_quality') f.properties.pm25`
 * 这样的代码都是错的, 请改从字段映射配置里取列名。
 */
export interface SpatialFeature<P extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: FeatureId;
  readonly dataset_id: DatasetId;
  readonly geom: GeoJsonPoint;
  /** 空间模式(GNNWR)下为 null */
  readonly observed_time: IsoDateTime | null;
  readonly properties: P;
}

/** GET /api/v1/spatial/tiles 的查询参数 */
export interface TilesQuery {
  dataset_id: DatasetId;
  /** 一律 WGS84。客户端不传 bbox_crs, 对齐后端默认 bbox_crs=WGS84。 */
  bbox: BBox;
  /** 时间区间 [start, end], epoch 毫秒。省略表示全时段。 */
  time?: readonly [number, number];
  /** 只取需要的属性列, 减小 payload。 */
  fields?: readonly string[];
  limit?: number;
  cursor?: string;
}

/**
 * 阶段 0 假设: 返回 GeoJSON 要素、单次上限 5000、游标分页。
 * 若后端实际返回 MVT, 只需替换 spatial.api.ts 的解码实现, 上层不动。
 */
export interface TilesResponse {
  readonly features: readonly SpatialFeature[];
  readonly crs: 'WGS84';
  readonly next_cursor: string | null;
  readonly total: number | null;
}

/** GET /api/v1/spatial/surface/{task_id} */
export interface SurfaceLayerInfo {
  readonly task_id: string;
  readonly service: 'WMS' | 'WMTS';
  readonly base_url: string;
  readonly layer_name: string;
  /**
   * 切片自身的坐标系。
   * 这是全项目最高风险字段 —— 若为 WGS84 而底图是高德(GCJ-02),
   * 会有 300~600m 系统性偏移, 且栅格无法逐点纠偏。
   * 联调后端默认自渲染 GCJ02 瓦片并带 sig; 勿对接 monorepo 旧 spatial。
   */
  readonly tile_crs: 'WGS84' | 'GCJ02' | 'EPSG:3857';
  readonly bbox: BBox;
  /**
   * 时间维度可用值。GTNNWR 点层时间轴可读它;
   * 曲面 WMS TIME 未实现, 见 wms_time_supported。
   */
  readonly time_dimension: readonly IsoDateTime[] | null;
  /** 后端自渲染曲面当前为 false: 不要给 WMS 传 TIME。 */
  readonly wms_time_supported?: boolean;
  readonly legend_url: string | null;
  readonly xyz_url_template?: string | null;
  readonly note?: string | null;
}
