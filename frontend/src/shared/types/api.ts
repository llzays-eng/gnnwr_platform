/**
 * 传输层约定。
 *
 * 后端是 FastAPI, 阶段 0 假设:
 *  - 成功: 直接返回业务对象(无 { code, data } 信封)
 *  - 失败: HTTP 4xx/5xx + { detail: string | { code, message } }
 * 若实际不同, 只改 http.ts 的 unwrap/normalizeError 两个函数。
 */
export interface FastApiErrorBody {
  readonly detail: string | { readonly code?: string; readonly message?: string };
}

/** 规范化后的错误, 全应用只处理这一种形状 */
export interface AppError {
  readonly code: AppErrorCode;
  /** 面向用户的中文文案, 已过 error-map */
  readonly message: string;
  /** 用户可以做什么。空数组表示只能重试。 */
  readonly actions: readonly string[];
  readonly httpStatus: number | null;
  readonly raw: unknown;
  /** 上报用的关联 id */
  readonly traceId: string | null;
}

export type AppErrorCode =
  | 'NETWORK_OFFLINE'
  | 'NETWORK_TIMEOUT'
  | 'REQUEST_CANCELLED'
  | 'AUTH_REQUIRED'
  | 'AUTH_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'PAYLOAD_TOO_LARGE'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'CONTRACT_MISSING'
  | 'UNKNOWN';

export interface Paginated<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly page_size: number;
}
