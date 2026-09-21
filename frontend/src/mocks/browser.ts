import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
import { wsHandlers } from './ws-handlers';

export const worker = setupWorker(...handlers, ...wsHandlers);

/**
 * 启动 Mock。
 * onUnhandledRequest: 'warn' 很重要 —— 前端调了一个没 mock 的接口时
 * 必须吵一声, 否则会静默走真网络然后 CORS 报错, 排查半天。
 */
export async function startMock(): Promise<void> {
  await worker.start({
    onUnhandledRequest: (req, print) => {
      if (new URL(req.url).pathname.startsWith('/api')) print.warning();
    },
    quiet: false,
  });
}
