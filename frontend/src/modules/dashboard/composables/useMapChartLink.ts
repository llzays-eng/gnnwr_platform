import { computed } from 'vue';
import type { FeatureId } from '@shared/types';
import { useSelectionStore } from '@stores/index';

/**
 * 地图 ↔ 图表联动。
 *
 * 全部走 selection store，组件之间零直连。
 * 一旦出现"地图组件直接调图表组件的方法"，视图数量一多
 * 就会变成 N² 条连线。
 *
 * brushSource 用来断回环: 图表触发的刷选不该再被图表响应一次。
 */
export function useMapChartLink(ids: () => readonly FeatureId[]) {
  const sel = useSelectionStore();

  const brushedIndices = computed(() => {
    if (!sel.hasBrush) return null;
    const set = new Set<number>();
    ids().forEach((id, i) => { if (sel.brushed.has(id)) set.add(i); });
    return set;
  });

  /** 地图刷选 → 写入总线 */
  function brushFromMap(indices: number[]): void {
    const all = ids();
    sel.setBrush(indices.map((i) => all[i]!).filter(Boolean), 'map');
  }

  /** 图表刷选 → 写入总线 */
  function brushFromChart(featureIds: FeatureId[]): void {
    sel.setBrush(featureIds, 'chart');
  }

  function selectIndex(i: number | null): void {
    sel.selected = i === null ? null : (ids()[i] ?? null);
  }

  function hoverIndex(i: number | null): void {
    sel.hovered = i === null ? null : (ids()[i] ?? null);
  }

  const selectedIndex = computed(() => {
    if (!sel.selected) return null;
    const i = ids().indexOf(sel.selected);
    return i >= 0 ? i : null;
  });

  return { sel, brushedIndices, selectedIndex, brushFromMap, brushFromChart, selectIndex, hoverIndex };
}
