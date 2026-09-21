import type { MapEventMap } from './types';

/**
 * 极小的类型安全事件发射器。
 * 直接用 `{ [K in keyof M]?: ((p: M[K]) => void)[] }` 做字段时,
 * 泛型方法里的 this.listeners[ev] 会被推成所有键的联合而无法调用 ——
 * 集中在这里用一次 as, 好过每个适配器各写一次。
 */
export class MapEmitter {
  private map = new Map<string, ((p: never) => void)[]>();

  on<K extends keyof MapEventMap>(ev: K, cb: (p: MapEventMap[K]) => void): () => void {
    const arr = this.map.get(ev as string) ?? [];
    arr.push(cb as (p: never) => void);
    this.map.set(ev as string, arr);
    return () => {
      const cur = this.map.get(ev as string);
      if (!cur) return;
      const i = cur.indexOf(cb as (p: never) => void);
      if (i >= 0) cur.splice(i, 1);
    };
  }

  emit<K extends keyof MapEventMap>(ev: K, payload: MapEventMap[K]): void {
    for (const cb of this.map.get(ev as string) ?? []) {
      (cb as (p: MapEventMap[K]) => void)(payload);
    }
  }

  clear(): void { this.map.clear(); }
}
