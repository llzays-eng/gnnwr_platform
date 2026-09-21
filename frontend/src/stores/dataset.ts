import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { ColumnGuess, Dataset, SourceCRS } from '@shared/types';

export interface UploadItem {
  localId: string;
  file: File;
  progress: number;
  status: 'queued' | 'uploading' | 'done' | 'error' | 'cancelled';
  error: string | null;
  abort: AbortController | null;
  datasetId: string | null;
}

/** 用户对自动识别结果的人工覆盖 */
export interface ColumnOverrides {
  longitude: string | null;
  latitude: string | null;
  temporal: string | null;
  sourceCrs: SourceCRS | null;
}

export const useDatasetStore = defineStore('dataset', () => {
  const queue = ref<UploadItem[]>([]);
  const current = ref<Dataset | null>(null);

  /**
   * 覆盖值与自动推断【分开存】。
   * 合并成一份就再也答不出"用户到底改了什么", 也就做不到
   * 「你改了 2 处」提示与一键还原。
   */
  const overrides = ref<ColumnOverrides>({ longitude: null, latitude: null, temporal: null, sourceCrs: null });

  const guess = computed<ColumnGuess | null>(() => current.value?.column_guess ?? null);

  /** 实际生效值: 覆盖优先, 否则用推断 */
  const effective = computed(() => ({
    longitude: overrides.value.longitude ?? guess.value?.longitude ?? null,
    latitude: overrides.value.latitude ?? guess.value?.latitude ?? null,
    temporal: overrides.value.temporal ?? guess.value?.temporal ?? null,
    sourceCrs: overrides.value.sourceCrs ?? current.value?.source_crs ?? null,
  }));

  const overrideCount = computed(() =>
    (['longitude', 'latitude', 'temporal', 'sourceCrs'] as const)
      .filter((k) => overrides.value[k] !== null).length);

  const resetOverrides = (): void => {
    overrides.value = { longitude: null, latitude: null, temporal: null, sourceCrs: null };
  };

  function enqueue(files: File[]): void {
    for (const file of files) {
      queue.value.push({
        localId: crypto.randomUUID(), file, progress: 0,
        status: 'queued', error: null, abort: null, datasetId: null,
      });
    }
  }

  function cancel(localId: string): void {
    const item = queue.value.find((q) => q.localId === localId);
    item?.abort?.abort();
    if (item) { item.status = 'cancelled'; }
  }

  return { queue, current, overrides, guess, effective, overrideCount, resetOverrides, enqueue, cancel };
});
