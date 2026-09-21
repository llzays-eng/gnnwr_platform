import { env } from '../config/env';
import { logger } from '../utils/logger';
import { modelApi } from '../api';
import type { CoefficientSummary, ModelTask, SocketPhase, TaskId, TaskSocketMessage } from '../types';
import { isTerminalTask } from '../types';

const log = logger.child('ws');

export interface TaskSocketHandlers {
  onTask: (task: ModelTask) => void;
  onCoefSummary: (summary: readonly CoefficientSummary[]) => void;
  onPhase: (phase: SocketPhase) => void;
  onLog: (line: { at: number; level: string; message: string }) => void;
}

/**
 * 训练进度双通道。
 *
 * 硬要求是"WebSocket 主推 + REST 轮询兜底 + 断线指数退避重连 +
 * 重连后补齐断连期间进度"。这里的关键设计:
 *
 *  1. 轮询【不是】只在断线时才启动, 而是常驻低频(8s)。
 *     因为 WS 最恶劣的失败模式不是断开, 是"连着但不推了" ——
 *     那种情况下 onclose 永远不触发, 只靠重连逻辑永远发现不了。
 *  2. 收到任何 WS 消息就刷新 lastMessageAt; 超过 20s 没消息
 *     主动断开重连, 把"假死"转成"断开"这个能处理的状态。
 *  3. 重连成功后立刻拉一次 /status —— 这就是"补齐断连期间进度",
 *     因为 WS 只推增量, 断开那几秒的 epoch 不会重发。
 *  4. 鉴权走 query token: 浏览器 WebSocket 构造函数不能设自定义 header。
 *     这是浏览器限制, 不是选择。待后端确认(协商清单 #1)。
 */
export class TaskSocket {
  private ws: WebSocket | null = null;
  private pollTimer: number | null = null;
  private watchdog: number | null = null;
  private retries = 0;
  private lastMessageAt = 0;
  private closed = false;
  private phase: SocketPhase = 'idle';

  constructor(
    private readonly taskId: TaskId,
    private readonly getToken: () => string | null,
    private readonly h: TaskSocketHandlers,
  ) {}

  start(): void {
    this.closed = false;
    void this.poll();                                  // 先拉一次, 首屏不等 WS
    this.pollTimer = window.setInterval(() => { void this.poll(); }, 8000);
    this.watchdog = window.setInterval(() => { this.checkStale(); }, 5000);
    this.connect();
  }

  stop(): void {
    this.closed = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.watchdog) clearInterval(this.watchdog);
    this.ws?.close();
    this.ws = null;
    this.setPhase('closed');
  }

  private setPhase(p: SocketPhase): void {
    if (this.phase === p) return;
    this.phase = p;
    this.h.onPhase(p);
  }

  private url(): string {
    const base = env.wsBaseUrl || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
    const token = this.getToken();
    return `${base}/ws/models/tasks/${this.taskId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  }

  private connect(): void {
    if (this.closed) return;
    this.setPhase(this.retries === 0 ? 'connecting' : 'reconnecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url());
    } catch (e) {
      log.warn('WebSocket 构造失败, 转轮询兜底', e);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.retries = 0;
      this.lastMessageAt = Date.now();
      this.setPhase('open');
      // 重连后必须补齐断连期间的进度: WS 只推增量, 断开那几秒不会重发
      void this.poll();
    };

    ws.onmessage = (e) => {
      this.lastMessageAt = Date.now();
      let msg: TaskSocketMessage;
      try { msg = JSON.parse(String(e.data)) as TaskSocketMessage; }
      catch { log.warn('无法解析的 WS 消息'); return; }
      this.handle(msg);
    };

    ws.onerror = () => { log.warn('WebSocket 出错'); };
    ws.onclose = () => { if (!this.closed) this.scheduleReconnect(); };
  }

  private handle(msg: TaskSocketMessage): void {
    switch (msg.type) {
      case 'progress':
        // coef_summary 是我们建议新增的字段(协商清单 #1)。
        // 没有它不报错, 监控页的系数带演进栏整体降级。
        if (msg.coef_summary) this.h.onCoefSummary(msg.coef_summary);
        void this.poll(); // 用 /status 作为任务对象的唯一真相, WS 只做触发
        break;
      case 'status':
        void this.poll();
        if (isTerminalTask(msg.status)) this.stop();
        break;
      case 'log':
        this.h.onLog({ at: msg.at, level: msg.level, message: msg.message });
        break;
      case 'error':
        log.error('任务错误', msg.code, msg.message);
        void this.poll();
        break;
      case 'pong':
        break;
    }
  }

  /** WS "连着但不推了" 的检测。这种假死靠 onclose 永远发现不了。 */
  private checkStale(): void {
    if (this.phase !== 'open') return;
    if (Date.now() - this.lastMessageAt > 20_000) {
      log.warn('WebSocket 超过 20s 无消息, 判定假死并重连');
      this.ws?.close();
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    this.retries++;
    if (this.retries > 6) {
      // 放弃 WS, 但轮询仍在跑 —— 功能降级而不是功能消失
      this.setPhase('fallback_polling');
      log.warn('重连 6 次失败, 转为纯轮询');
      return;
    }
    // 指数退避 + 抖动, 避免多标签页同时重连打爆网关
    const delay = Math.min(30_000, 800 * 2 ** (this.retries - 1)) + Math.random() * 400;
    this.setPhase('reconnecting');
    window.setTimeout(() => { this.connect(); }, delay);
  }

  private async poll(): Promise<void> {
    if (this.closed) return;
    try {
      const task = await modelApi.status(this.taskId);
      this.h.onTask(task);
      if (isTerminalTask(task.status)) this.stop();
    } catch (e) {
      log.debug('轮询失败', e);
    }
  }
}
