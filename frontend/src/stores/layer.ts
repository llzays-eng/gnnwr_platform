import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { BBox } from '@shared/types';

export type LayerKind = 'points' | 'coefficient' | 'residual' | 'surface' | 'heatmap';
export type ClassifyMethod = 'equal_interval' | 'quantile' | 'natural_breaks';
export type RampKind = 'diverging' | 'sequential';

export interface LayerState {
  id: string;
  kind: LayerKind;
  label: string;
  visible: boolean;
  opacity: number;
  /** 层序, 数字大的在上 */
  z: number;
  /** coefficient 图层对应的自变量名 */
  variable: string | null;
  ramp: RampKind;
  classify: ClassifyMethod;
  classCount: number;
  /** 分级断点。图例与地图【共用这一份】, 从结构上杜绝二者不一致。 */
  breaks: number[];
  loading: boolean;
  error: string | null;
}

export const useLayerStore = defineStore('layer', () => {
  const layers = ref<LayerState[]>([]);
  const viewport = ref<{ bbox: BBox; zoom: number } | null>(null);

  const ordered = computed(() => [...layers.value].sort((a, b) => a.z - b.z));
  const visible = computed(() => ordered.value.filter((l) => l.visible));
  /** 同屏最多一条发散色带 —— 两条发散带并置会让用户无法判断颜色属于哪一层 */
  const divergingCount = computed(() => visible.value.filter((l) => l.ramp === 'diverging').length);

  function upsert(layer: LayerState): void {
    const i = layers.value.findIndex((l) => l.id === layer.id);
    if (i >= 0) layers.value[i] = layer;
    else layers.value.push(layer);
  }

  const patch = (id: string, p: Partial<LayerState>): void => {
    const i = layers.value.findIndex((l) => l.id === id);
    if (i >= 0) layers.value[i] = { ...layers.value[i]!, ...p };
  };

  const remove = (id: string): void => { layers.value = layers.value.filter((l) => l.id !== id); };

  const reorder = (id: string, z: number): void => { patch(id, { z }); };

  return { layers, viewport, ordered, visible, divergingCount, upsert, patch, remove, reorder };
});
