/**
 * 单飞: 同一 key 的并发调用只真正执行一次, 其余等同一个 Promise。
 * 用于 token 刷新(并发 401 只应刷新一次)与重复的瓦片请求。
 */
export function singleFlight<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  keyOf: (...args: A) => string = () => '_',
): (...args: A) => Promise<R> {
  const inflight = new Map<string, Promise<R>>();
  return (...args: A): Promise<R> => {
    const key = keyOf(...args);
    const existing = inflight.get(key);
    if (existing) return existing;
    const p = fn(...args).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
}
