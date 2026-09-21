import type { DatasetId, SurfaceLayerInfo, TaskId, TilesQuery, TilesResponse } from '../types';
import { FROZEN } from './endpoints';
import { get } from './http';

export const spatialApi = {
  /**
   * 视野增量查询。
   * 调用方必须传 signal —— 视野变化极快, 不取消过期请求会让
   * 后到的旧响应覆盖新数据(经典的竞态渲染错位)。
   */
  tiles: (q: TilesQuery, signal: AbortSignal) =>
    get<TilesResponse>(FROZEN.tiles, {
      params: {
        dataset_id: q.dataset_id,
        bbox: q.bbox.join(','),
        // bbox 已是 WGS84(视口在适配器出站时反投影)。显式声明, 避免后端改默认。
        bbox_crs: 'WGS84',
        time_start: q.time?.[0],
        time_end: q.time?.[1],
        fields: q.fields?.join(','),
        limit: q.limit ?? 5000,
        cursor: q.cursor,
      },
      signal,
      retry: 0, // 视野已经变了, 重试旧视野的请求没有意义
    }),

  surface: (taskId: TaskId) => get<SurfaceLayerInfo>(FROZEN.surface(taskId)),
};

/** 便利函数: 把 dataset 的全量点抽样成首屏概览 */
export const overviewTiles = (datasetId: DatasetId, signal: AbortSignal) =>
  spatialApi.tiles({ dataset_id: datasetId, bbox: [72, 0.8, 137.9, 55.9], limit: 2000 }, signal);
