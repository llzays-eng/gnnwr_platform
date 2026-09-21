import type { BBox, SurfaceLayerInfo } from '../types';
import type { CRS } from '../geo';

/**
 * 适配器出站视口。center / bbox 一律 WGS84。
 * 高德内部是 GCJ-02, 由 AmapAdapter.getViewport 反投影后再发出;
 * 这样 TilesQuery / 系数分页可以直接吃 bbox, 不必再传 bbox_crs。
 */
export interface Viewport {
  center: [number, number];
  zoom: number;
  bbox: BBox;
}

export interface PointLayerInput {
  id: string;
  /** 已经处在 adapter.renderCrs 下的坐标, [lng,lat,lng,lat,...] */
  xy: Float64Array;
  /** 每点颜色, 长度 = xy.length/2 */
  colors: string[];
  radius: number;
  opacity: number;
  visible: boolean;
  z: number;
  /** 高亮子集(刷选/联动), 用要素下标 */
  highlight?: Set<number> | null;
}

export interface MountOptions {
  /** 一律 WGS84。高德适配器在 mount 时转到 GCJ-02; 图纸底原样使用。 */
  center: [number, number];
  zoom: number;
  theme: 'light' | 'dark';
}

export type MapEventMap = {
  viewport: Viewport;
  hover: { index: number; layerId: string } | null;
  click: { index: number; layerId: string } | null;
  brush: { layerId: string; indices: number[] } | null;
};

/**
 * 地图内核抽象。
 *
 * 存在的理由不是"以后可能换地图"这种空话, 而是两个具体的已知风险:
 *  1. 无外网/内网演示时高德 JS API 加载不了(阶段 0 问题 5)
 *  2. GeoServer 若只出 WGS84 栅格, 曲面视图可能要整体切到 WGS84 底图
 *     (docs/风险-栅格偏移.md 路线 C)
 * 两者都要求渲染后端可替换, 而事后再抽象代价极高。
 *
 * 关键设计: renderCrs 由适配器【自己声明】, 上层据此转换。
 * 高德是 GCJ02, 离线图纸底是 WGS84 —— 把这件事写进接口,
 * 而不是在调用处 if/else, 是坐标系纪律的一部分。
 */
export interface MapAdapter {
  readonly kind: 'amap' | 'sheet';
  readonly renderCrs: CRS;
  /** 给用户看的说明, 例如"离线图纸底 · 未配置高德 Key" */
  readonly notice: string | null;

  mount(el: HTMLElement, opts: MountOptions): Promise<void>;
  destroy(): void;
  setTheme(theme: 'light' | 'dark'): void;

  upsertPointLayer(input: PointLayerInput): void;
  removeLayer(id: string): void;
  setSurface(info: SurfaceLayerInfo | null, opts: { opacity: number; visible: boolean; time?: string | null }): void;

  /** bbox 一律 WGS84。高德适配器内部转到 GCJ-02; 图纸底原样使用。 */
  fitBounds(bbox: BBox, paddingPx?: number): void;
  /** 返回的 bbox / center 一律 WGS84, 可直接用于空间查询。 */
  getViewport(): Viewport;
  setBrushMode(on: boolean): void;

  on<K extends keyof MapEventMap>(ev: K, cb: (payload: MapEventMap[K]) => void): () => void;
}
