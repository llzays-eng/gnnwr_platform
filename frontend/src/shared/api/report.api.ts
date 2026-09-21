import type { TaskId } from '../types';
import { FROZEN, PENDING } from './endpoints';
import { get, request } from './http';

export type ReportJobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface ReportJob {
  readonly job_id: string;
  readonly status: ReportJobStatus;
  readonly download_url: string | null;
  readonly progress: number;
  readonly error: string | null;
}

export const reportApi = {
  /**
   * 协商清单 #7: 后端未说明这是同步返回文件流还是异步返回 job。
   * 这里做运行时探测 —— 响应是 JSON 就当 job, 是二进制就当文件流。
   * 探测比假设安全, 而且两种后端实现都能跑。
   */
  export: async (taskId: TaskId): Promise<{ kind: 'blob'; blob: Blob } | { kind: 'job'; job: ReportJob }> => {
    const res = await request<Blob>({
      url: FROZEN.exportReport(taskId),
      method: 'get',
      responseType: 'blob',
      timeout: 120_000,
    });
    if (res.type.includes('json')) {
      const job = JSON.parse(await res.text()) as ReportJob;
      return { kind: 'job', job };
    }
    return { kind: 'blob', blob: res };
  },

  jobStatus: (jobId: string) => get<ReportJob>(PENDING.reportJob(jobId), { pendingContract: true, retry: 0 }),
};
