import type { AppError, AppErrorCode, FastApiErrorBody } from '../types/api';

/**
 * 错误码 -> 用户可读文案。
 *
 * 文案纪律(设计要求 §六): 错误不道歉、不含糊,
 * 说明发生了什么 + 怎么修复。所以每条都配 actions。
 */
const TEXT: Record<AppErrorCode, { message: string; actions: string[] }> = {
  NETWORK_OFFLINE: { message: '网络连接已断开。', actions: ['检查网络后重试'] },
  NETWORK_TIMEOUT: { message: '请求超时, 服务器没有在预期时间内响应。', actions: ['重试', '若持续超时请联系管理员'] },
  REQUEST_CANCELLED: { message: '请求已取消。', actions: [] },
  AUTH_REQUIRED: { message: '此操作需要登录。', actions: ['登录后重试'] },
  AUTH_EXPIRED: { message: '登录状态已过期。', actions: ['重新登录'] },
  FORBIDDEN: { message: '当前账号没有此操作的权限。', actions: ['联系项目管理员申请权限'] },
  NOT_FOUND: { message: '目标不存在, 可能已被删除。', actions: ['返回列表刷新'] },
  VALIDATION_FAILED: { message: '提交的配置未通过校验。', actions: ['按提示修正标红项后重新提交'] },
  PAYLOAD_TOO_LARGE: { message: '文件超过服务端接收上限。', actions: ['拆分文件后分批上传', '或联系管理员调整上限'] },
  CONFLICT: { message: '资源状态已变化, 你的操作与当前状态冲突。', actions: ['刷新后重试'] },
  RATE_LIMITED: { message: '请求过于频繁, 已被限流。', actions: ['稍候再试'] },
  SERVER_ERROR: { message: '服务端处理失败。', actions: ['重试', '若持续失败请把错误编号发给管理员'] },
  SERVICE_UNAVAILABLE: { message: '服务暂时不可用, 可能正在维护或算力节点繁忙。', actions: ['稍后重试'] },
  CONTRACT_MISSING: { message: '此功能依赖的后端接口尚未提供。', actions: ['见「接口协商清单」', '当前可先用模拟数据体验流程'] },
  UNKNOWN: { message: '发生了未预期的错误。', actions: ['重试', '把错误编号发给管理员'] },
};

const BY_STATUS: Record<number, AppErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'AUTH_EXPIRED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
  500: 'SERVER_ERROR',
  502: 'SERVICE_UNAVAILABLE',
  503: 'SERVICE_UNAVAILABLE',
  504: 'NETWORK_TIMEOUT',
};

export function codeFromStatus(status: number | null): AppErrorCode {
  if (status === null) return 'UNKNOWN';
  return BY_STATUS[status] ?? (status >= 500 ? 'SERVER_ERROR' : 'UNKNOWN');
}

export function makeAppError(
  code: AppErrorCode,
  opts: { httpStatus?: number | null; raw?: unknown; traceId?: string | null; detail?: string } = {},
): AppError {
  const t = TEXT[code];
  return {
    code,
    // 后端给了具体 detail 就优先用它 —— 后端最清楚哪一列出了问题
    message: opts.detail?.trim() ? opts.detail.trim() : t.message,
    actions: t.actions,
    httpStatus: opts.httpStatus ?? null,
    raw: opts.raw ?? null,
    traceId: opts.traceId ?? null,
  };
}

export function extractDetail(body: unknown): string | undefined {
  const b = body as FastApiErrorBody | undefined;
  if (!b || typeof b !== 'object') return undefined;
  const d = b.detail;
  if (typeof d === 'string') return d;
  if (d && typeof d === 'object' && typeof d.message === 'string') return d.message;
  return undefined;
}
