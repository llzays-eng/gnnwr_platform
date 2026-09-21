import { ref, shallowRef, watch, type Ref } from 'vue';
import { isAppError, modelApi } from '@shared/api';
import type { BBox, CoefficientPoint, TaskId } from '@shared/types';
import { bboxKey, expandBBox } from '@shared/geo';
import { logger } from '@shared/utils/logger';

const log = logger.child('coef');

/**
 * 逐点系数的访问抽象层。
 *
 * 后端已提供系数接口，前端固定按 WGS84 bbox 做视野增量查询并缓存。
 * 这一层仍然保留，目的是把缓存/取消/竞态治理集中到一个地方，
 * 看板视图只关心 points 与 loading/error。
 */
const CACHE_MAX = 24;

export function useCoefficientField(taskId: Ref<TaskId | null>, viewport: Ref<{ bbox: BBox; zoom: number } | null>) {
  const points = shallowRef<CoefficientPoint[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  /** 显示后端是否返回 next_cursor, 用于提示是否发生了服务端截断。 */
  const paged = ref<boolean | null>(null);

  const cache = new Map<string, CoefficientPoint[]>();
  let abort: AbortController | null = null;

  function touch(key: string, val: CoefficientPoint[]): void {
    cache.delete(key);
    cache.set(key, val);
    // LRU: Map 保序，最早插入的就是最久未用的
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  }

  async function load(): Promise<void> {
    const id = taskId.value;
    const vp = viewport.value;
    if (!id) return;

    if (!vp) return;

    // 预取一圈，小幅拖动不必重新请求
    const bbox = vp ? expandBBox(vp.bbox, 0.2) : ([72, 0.8, 137.9, 55.9] as BBox);
    const key = bboxKey(bbox, Math.round(vp?.zoom ?? 5));
    const hit = cache.get(key);
    if (hit) { touch(key, hit); points.value = hit; return; }

    abort?.abort(); // 视野已经变了，旧请求的结果只会造成竞态错位
    abort = new AbortController();
    loading.value = true;
    error.value = null;
    try {
      const res = await modelApi.coefficients(id, { bbox, limit: 8000 }, abort.signal);
      paged.value = res.next_cursor !== null;
      touch(key, res.points);
      points.value = res.points;
    } catch (e) {
      if (isAppError(e) && e.code === 'REQUEST_CANCELLED') return;
      if (isAppError(e) && e.code === 'NOT_FOUND') {
        log.warn('系数接口返回 404，可能连接到了错误后端');
        error.value = '逐点系数接口不可用。请确认 API 指向 gnnwr_platform_backend（非 monorepo 旧后端）。';
        return;
      }
      error.value = isAppError(e) ? e.message : '系数图层加载失败。';
    } finally {
      loading.value = false;
    }
  }

  watch([taskId, viewport], () => { void load(); }, { immediate: true, deep: false });

  return { points, loading, error, paged };
}
