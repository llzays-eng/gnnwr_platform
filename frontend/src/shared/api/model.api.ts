import type {
  BaselineComparison, CoefficientPoint, ModelResult, ModelTask, Paginated,
  ProjectId, TaskId, TrainRequest,
} from '../types';
import type { BBox } from '../types/spatial';
import { FROZEN } from './endpoints';
import { get, post } from './http';

export const modelApi = {
  train: (body: TrainRequest) => post<ModelTask>(FROZEN.train, body),

  /** 轮询兜底。retry: 0 —— 轮询本身就是重试, 再叠一层只会放大风暴。 */
  status: (id: TaskId, signal?: AbortSignal) =>
    get<ModelTask>(FROZEN.taskStatus(id), { signal, retry: 0 }),

  result: (id: TaskId) => get<ModelResult>(FROZEN.taskResult(id)),

  compare: (id: TaskId) => get<BaselineComparison>(FROZEN.taskCompare(id)),

  /**
   * 逐点系数, 按 bbox 增量取。bbox 一律 WGS84(视口已在适配器出站时反投影)。
   * 10 万点 × 8 变量一次性返回是百 MB 级 JSON, 必须分片。
   */
  coefficients: (
    id: TaskId,
    params: { bbox: BBox; vars?: string[]; time?: [number, number]; cursor?: string; limit?: number },
    signal?: AbortSignal,
  ) =>
    get<{ points: CoefficientPoint[]; next_cursor: string | null }>(FROZEN.coefficients(id), {
      params: {
        bbox: params.bbox.join(','),
        vars: params.vars?.join(','),
        time_start: params.time?.[0],
        time_end: params.time?.[1],
        cursor: params.cursor,
        limit: params.limit ?? 5000,
      },
      signal,
    }),

  cancel: (id: TaskId) => post<void>(FROZEN.cancelTask(id), undefined),

  logs: (id: TaskId, since?: number) =>
    get<{ lines: { at: number; level: string; message: string }[] }>(FROZEN.taskLogs(id), {
      params: { since },
    }),

  listTasks: (projectId: ProjectId) =>
    get<Paginated<ModelTask>>(FROZEN.listTasks, {
      params: { project_id: projectId },
    }),
};
