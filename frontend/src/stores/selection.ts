import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { FeatureId } from '@shared/types';

/**
 * 联动总线。
 *
 * 地图刷选 → 图表过滤、图表点击 → 地图高亮, 全部只经过这里。
 * 组件之间【零直连】—— 一旦出现「地图组件直接调图表组件的方法」,
 * 视图数量一多就会变成 N² 条连线。
 */
export const useSelectionStore = defineStore('selection', () => {
  const hovered = ref<FeatureId | null>(null);
  const selected = ref<FeatureId | null>(null);
  /** 刷选集合。用 Set 因为要频繁做 has() 判断(每个点渲染都要问一次)。 */
  const brushed = ref<Set<FeatureId>>(new Set());
  /** 刷选的来源, 用于避免回环: 图表触发的刷选不应再被图表响应一次 */
  const brushSource = ref<'map' | 'chart' | null>(null);

  const hasBrush = computed(() => brushed.value.size > 0);

  function setBrush(ids: Iterable<FeatureId>, source: 'map' | 'chart'): void {
    brushed.value = new Set(ids);
    brushSource.value = source;
  }

  function clearBrush(): void {
    brushed.value = new Set();
    brushSource.value = null;
  }

  return { hovered, selected, brushed, brushSource, hasBrush, setBrush, clearBrush };
});
