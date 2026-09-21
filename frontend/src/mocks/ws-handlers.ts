import { ws } from 'msw';
import type { TaskId, TaskSocketMessage } from '@shared/types';
import { asId } from '@shared/types';
import { db, scenarios } from './db';
import { coefSummariesOf } from './fixtures/scenarios';

/**
 * 训练进度的 WebSocket Mock。
 *
 * 选 MSW 2.x 而非 vite-plugin-mock 的决定性理由就是这一段:
 * WebSocket 也能被拦截, 于是「断线重连 + 轮询兜底」这条最难验证的链路
 * 可以在没有后端的情况下完整演练 —— 包括故意断线。
 *
 * 调试开关(浏览器控制台):
 *   __mockWs.drop()      立刻断开所有连接, 验证重连退避
 *   __mockWs.silence(ms) 静默一段时间, 验证轮询兜底接管
 *   __mockWs.noCoef=true 停发 coef_summary, 验证系数带演进栏的优雅降级
 */
const link = ws.link('*/ws/models/tasks/:taskId');

interface Ctl {
  drop: () => void;
  silence: (ms: number) => void;
  noCoef: boolean;
}

const clients = new Set<{ close: () => void }>();
let silencedUntil = 0;
const ctl: Ctl = {
  drop: () => { clients.forEach((c) => { c.close(); }); clients.clear(); },
  silence: (ms) => { silencedUntil = Date.now() + ms; },
  noCoef: false,
};

export const wsHandlers = [
  link.addEventListener('connection', ({ client, params }) => {
    const taskId = asId<TaskId>(String(params['taskId']));
    clients.add({ close: () => { client.close(); } });

    const timer = setInterval(() => {
      if (Date.now() < silencedUntil) return;

      const task = db.taskSnapshot(taskId);
      if (!task) {
        send(client, { type: 'error', task_id: taskId, code: 'TASK_NOT_FOUND', message: '任务不存在。' });
        return;
      }

      if (task.status === 'RUNNING' && task.progress) {
        const sc = scenarios[task.project_id];
        const msg: TaskSocketMessage = {
          type: 'progress',
          task_id: taskId,
          progress: task.progress,
          ...(ctl.noCoef || !sc
            ? {}
            : { coef_summary: growingBands(sc, [...task.x_columns], task.progress.epoch / task.progress.total_epochs) }),
        };
        send(client, msg);
      } else {
        send(client, { type: 'status', task_id: taskId, status: task.status });
        if (task.status === 'SUCCESS' || task.status === 'FAILED') {
          clearInterval(timer);
          client.close();
        }
      }
    }, 900);

    client.addEventListener('message', (e) => {
      if (String(e.data) === 'ping') send(client, { type: 'pong' });
    });
    client.addEventListener('close', () => { clearInterval(timer); });
  }),
];

function send(client: { send: (d: string) => void }, msg: TaskSocketMessage): void {
  client.send(JSON.stringify(msg));
}

/**
 * 让系数带随训练进度「长开」。
 * 早期各变量系数几乎一致(带很窄), 随 epoch 推进空间差异逐渐显现(带变宽) ——
 * 这正是训练监控页想让用户看见的东西, Mock 必须真的模拟出来,
 * 否则演示时那一栏是死的, 也就验证不了设计成不成立。
 */
function growingBands(sc: (typeof scenarios)[keyof typeof scenarios], vars: string[], ratio: number) {
  const full = coefSummariesOf(sc.coefficients, vars);
  const k = Math.min(1, ratio * 1.3);
  return full.map((c) => ({
    ...c,
    std: c.std * k,
    min: c.mean + (c.min - c.mean) * k,
    max: c.mean + (c.max - c.mean) * k,
    q05: c.mean + (c.q05 - c.mean) * k,
    q25: c.mean + (c.q25 - c.mean) * k,
    q50: c.mean + (c.q50 - c.mean) * k,
    q75: c.mean + (c.q75 - c.mean) * k,
    q95: c.mean + (c.q95 - c.mean) * k,
  }));
}

declare global {
  interface Window { __mockWs?: Ctl }
}
if (typeof window !== 'undefined') window.__mockWs = ctl;
