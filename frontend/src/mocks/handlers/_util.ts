import { HttpResponse, delay } from 'msw';
import { env } from '@shared/config/env';

/** 模拟真实网络延迟。太快会掩盖 loading 状态的设计缺陷。 */
export const lag = (min = 120, max = 420) => delay(min + Math.random() * (max - min));

export const ok = <T extends object | null>(data: T) => HttpResponse.json(data);

export const fail = (status: number, detail: string) =>
  HttpResponse.json({ detail }, { status });

/**
 * 未确认接口的守卫。
 * 关掉 VITE_MOCK_ASSUME_PENDING_CONTRACTS 后, 这些接口一律 404,
 * 前端会立刻显示「此功能依赖的后端接口尚未提供」——
 * 这是在联调前主动暴露契约缺口的手段。
 * 已解冻的 list / 分片 / coefficients / cancel / logout 不再走这里;
 * 目前仍受开关控制的是报告异步 job(#7) 等真正 PENDING 项。
 */
export const guardPending = () =>
  env.assumePendingContracts ? null : fail(404, '该接口尚未与后端确认, 见接口协商清单。');

export const parseBBox = (raw: string | null): [number, number, number, number] | null => {
  if (!raw) return null;
  const p = raw.split(',').map(Number);
  return p.length === 4 && p.every(Number.isFinite) ? (p as [number, number, number, number]) : null;
};
