import { env } from '../config/env';

type Level = 'debug' | 'info' | 'warn' | 'error';
const RANK: Record<Level | 'silent', number> = { debug: 0, info: 1, warn: 2, error: 3, silent: 99 };

/**
 * 统一日志出口。
 * ESLint 禁了全局 console, 所有输出必须从这里走 ——
 * 这样接入 Sentry 之类的上报只需要改这一个文件。
 */
class Logger {
  constructor(private readonly scope: string) {}

  child(scope: string): Logger {
    return new Logger(`${this.scope}:${scope}`);
  }

  private emit(level: Level, args: unknown[]): void {
    if (RANK[level] < RANK[env.logLevel]) return;
    // eslint-disable-next-line no-console
    console[level](`[${this.scope}]`, ...args);
  }

  debug(...a: unknown[]): void { this.emit('debug', a); }
  info(...a: unknown[]): void { this.emit('info', a); }
  warn(...a: unknown[]): void { this.emit('warn', a); }
  error(...a: unknown[]): void { this.emit('error', a); }

  /** 供全局错误边界与 window.onerror 调用 */
  report(err: unknown, context: Record<string, unknown> = {}): void {
    this.emit('error', [err, context]);
    // TODO(阶段 5): 接入上报服务
  }
}

export const logger = new Logger('gnnwr');
