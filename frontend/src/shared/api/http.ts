import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import type { AppError } from '../types/api';
import { codeFromStatus, extractDetail, makeAppError } from './error-map';

const log = logger.child('http');

/** 扩展的请求配置。用 declare module 会污染全局, 这里显式传更清楚。 */
export interface RequestOptions extends AxiosRequestConfig {
  /** 幂等请求失败后的重试次数。默认 GET=2, 其余=0。写操作绝不自动重试。 */
  retry?: number;
  /** 跳过 401 拦截。登录接口自己处理凭据错误, 不该被跳转登录。 */
  skipAuthRedirect?: boolean;
  /** 标记为「后端尚未确认」的接口, 失败时给出 CONTRACT_MISSING 而不是 404 */
  pendingContract?: boolean;
}

type AuthHooks = {
  getToken: () => string | null;
  onUnauthorized: () => void;
};

/**
 * 鉴权钩子由 auth store 在启动时注入。
 * 不直接 import store 是为了避免 http.ts ← store ← http.ts 的循环依赖,
 * 也让 http.ts 在单测里可以脱离 Pinia 使用。
 */
let hooks: AuthHooks = { getToken: () => null, onUnauthorized: () => {} };
export const installAuthHooks = (h: AuthHooks): void => { hooks = h; };

export const http: AxiosInstance = axios.create({
  baseURL: env.enableMock ? '' : env.apiBaseUrl,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = hooks.getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Request-Id'] = crypto.randomUUID();
  return config;
});

function normalize(err: unknown, opts: RequestOptions): AppError {
  if (axios.isCancel(err)) return makeAppError('REQUEST_CANCELLED');

  const ax = err as AxiosError;
  if (ax.code === 'ECONNABORTED') return makeAppError('NETWORK_TIMEOUT', { raw: err });
  if (!ax.response) {
    return makeAppError(navigator.onLine ? 'UNKNOWN' : 'NETWORK_OFFLINE', { raw: err });
  }

  const status = ax.response.status;
  // 未确认的接口在真实后端上会 404/405。这时给 CONTRACT_MISSING 更诚实,
  // 否则用户会以为是自己的数据没了。
  if (opts.pendingContract && (status === 404 || status === 405)) {
    return makeAppError('CONTRACT_MISSING', { httpStatus: status, raw: err });
  }

  return makeAppError(codeFromStatus(status), {
    httpStatus: status,
    raw: err,
    detail: extractDetail(ax.response.data),
    traceId: (ax.response.headers['x-request-id'] as string | undefined) ?? null,
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 统一请求出口。
 *
 * 返回值直接是业务对象 —— 后端(FastAPI)不套信封。
 * 若实际有 { code, data } 信封, 只改这个函数的最后一行。
 */
export async function request<T>(opts: RequestOptions): Promise<T> {
  const method = (opts.method ?? 'get').toString().toLowerCase();
  const maxRetry = opts.retry ?? (method === 'get' ? 2 : 0);

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await http.request<T>(opts);
      return res.data;
    } catch (raw) {
      const e = normalize(raw, opts);

      if (e.code === 'AUTH_EXPIRED' && !opts.skipAuthRedirect) {
        hooks.onUnauthorized();
        throw e;
      }
      // 只重试「重试有意义」的错误, 且只对幂等方法
      const retryable = ['NETWORK_TIMEOUT', 'SERVICE_UNAVAILABLE', 'SERVER_ERROR'].includes(e.code);
      if (attempt < maxRetry && retryable) {
        const backoff = 300 * 2 ** attempt + Math.random() * 200; // 抖动, 避免多标签页同时重试
        log.warn(`重试 ${attempt + 1}/${maxRetry}`, opts.url, e.code);
        await sleep(backoff);
        continue;
      }
      log.error(opts.method ?? 'GET', opts.url, e.code, e.message);
      throw e;
    }
  }
}

export const get = <T>(url: string, opts: RequestOptions = {}): Promise<T> =>
  request<T>({ ...opts, url, method: 'get' });

export const post = <T>(url: string, data?: unknown, opts: RequestOptions = {}): Promise<T> =>
  request<T>({ ...opts, url, method: 'post', data });

export const del = <T>(url: string, opts: RequestOptions = {}): Promise<T> =>
  request<T>({ ...opts, url, method: 'delete' });

/** 类型守卫。catch 块里判断是不是我们规范化过的错误。 */
export const isAppError = (e: unknown): e is AppError =>
  typeof e === 'object' && e !== null && 'code' in e && 'actions' in e;
