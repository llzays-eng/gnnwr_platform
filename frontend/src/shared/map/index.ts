import { env } from '../config/env';
import { logger } from '../utils/logger';
import { SheetAdapter } from './sheet-adapter';
import type { MapAdapter } from './types';

export * from './types';
export { SheetAdapter } from './sheet-adapter';

/**
 * 适配器工厂。
 *
 * 选择逻辑刻意简单且可解释:
 *   没配 Key → 图纸底(并说明原因)
 *   配了 Key 但加载失败(无外网/域名白名单没配/配额用尽) → 图纸底 + 说明
 *   正常 → 高德
 *
 * 不静默失败: 用图纸底时界面会显示一条说明, 否则用户会以为"底图坏了"。
 */
export async function createMapAdapter(): Promise<MapAdapter> {
  if (!env.amapKey) {
    return new SheetAdapter('离线图纸底 · 未配置高德 Key，当前显示经纬网底与数据点');
  }
  try {
    const { AmapAdapter } = await import('./amap-adapter');
    return new AmapAdapter();
  } catch (e) {
    logger.child('map').warn('高德 SDK 加载失败, 回退图纸底', e);
    return new SheetAdapter('离线图纸底 · 高德底图加载失败，已回退。检查网络与 Key 的安全域名白名单');
  }
}
