import * as Comlink from 'comlink';
import type { SpatialFeature } from '../types';

/**
 * 要素解析 Worker。
 *
 * 为什么必须在 Worker 里: /spatial/tiles 一次可能返回数千到上万个要素,
 * 主线程上 map 一遍并建对象数组会产生几十到几百毫秒的长任务,
 * 表现就是拖地图时明显一顿。
 *
 * 为什么返回 TypedArray 而不是对象数组: 结构化克隆 10 万个 {lng,lat}
 * 的开销本身就足以掉帧。TypedArray 走 Transferable, 零拷贝。
 */
export interface ParsedFeatures {
  /** [lng,lat,...] WGS84 —— 后端契约固定 */
  xy: Float64Array;
  /** 被选中属性的数值, 与点一一对应; 非数值为 NaN */
  values: Float32Array;
  ids: string[];
  times: Float64Array;
}

const api = {
  parse(features: SpatialFeature[], valueField: string | null): ParsedFeatures {
    const n = features.length;
    const xy = new Float64Array(n * 2);
    const values = new Float32Array(n);
    const times = new Float64Array(n);
    const ids = new Array<string>(n);

    for (let i = 0; i < n; i++) {
      const f = features[i]!;
      xy[i * 2] = f.geom.coordinates[0]!;
      xy[i * 2 + 1] = f.geom.coordinates[1]!;
      ids[i] = f.id;
      times[i] = f.observed_time ? Date.parse(f.observed_time) : NaN;
      const raw = valueField ? f.properties[valueField] : undefined;
      values[i] = typeof raw === 'number' ? raw : NaN;
    }
    return Comlink.transfer({ xy, values, ids, times }, [xy.buffer, values.buffer, times.buffer]);
  },
};

export type FeatureParseApi = typeof api;
Comlink.expose(api);
