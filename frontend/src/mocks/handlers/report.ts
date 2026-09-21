import { http } from 'msw';
import { FROZEN, PENDING } from '@shared/api/endpoints';
import { guardPending, lag, ok } from './_util';

const jobs = new Map<string, number>();

export const reportHandlers = [
  // 协商清单 #7: 未确认是同步还是异步。Mock 按【异步】实现,
  // 因为异步是更难的那一种 —— 前端按异步写, 同步后端也能兼容, 反之不行。
  http.get(FROZEN.exportReport(':id'), async ({ params }) => {
    await lag(200, 500);
    const jobId = `job_${String(params['id'])}`;
    jobs.set(jobId, Date.now());
    return ok({ job_id: jobId, status: 'queued', download_url: null, progress: 0, error: null });
  }),

  http.get(PENDING.reportJob(':jobId'), async ({ params }) => {
    const g = guardPending();
    if (g) return g;
    const jobId = String(params['jobId']);
    const start = jobs.get(jobId) ?? Date.now();
    const elapsed = Date.now() - start;
    const done = elapsed > 8000;
    return ok({
      job_id: jobId,
      status: done ? 'done' : 'running',
      progress: Math.min(1, elapsed / 8000),
      download_url: done ? '/mock/report.pdf' : null,
      error: null,
    });
  }),
];
