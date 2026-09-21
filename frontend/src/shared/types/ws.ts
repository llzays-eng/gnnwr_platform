import type { TaskId } from './brand';
import type { CoefficientSummary } from './result';
import type { TaskProgress, TaskStatus } from './model';

/**
 * WS /ws/models/tasks/{task_id} 的消息。
 *
 * 阶段 0 假设的 payload。真实结构待后端确认(协商清单 #1)。
 * coef_summary 是我们【建议新增】的字段, 用于训练监控页的系数带演进栏 ——
 * 目标用户读不懂 loss 曲线, 但读得懂「地铁距离的影响正在南北分化」。
 *
 * 未提供时不报错, 整栏优雅降级, 见 monitor 模块的 capability 检测。
 */
export type TaskSocketMessage =
  | { readonly type: 'progress'; readonly task_id: TaskId; readonly progress: TaskProgress; readonly coef_summary?: readonly CoefficientSummary[] }
  | { readonly type: 'status'; readonly task_id: TaskId; readonly status: TaskStatus }
  | { readonly type: 'log'; readonly task_id: TaskId; readonly level: 'info' | 'warn' | 'error'; readonly message: string; readonly at: number }
  | { readonly type: 'error'; readonly task_id: TaskId; readonly code: string; readonly message: string }
  | { readonly type: 'pong' };

export type SocketPhase = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'fallback_polling';
