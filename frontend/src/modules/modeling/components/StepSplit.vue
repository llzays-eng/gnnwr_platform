<script setup lang="ts">
import { computed } from 'vue';
import type { DatasetSplit } from '@shared/types';
import { useModelingStore } from '@stores/index';

const props = defineProps<{ rowCount: number }>();
const store = useModelingStore();
const split = computed(() => store.draft.split);

const counts = computed(() => ({
  train: Math.round(props.rowCount * split.value.train),
  val: Math.round(props.rowCount * split.value.val),
  test: Math.round(props.rowCount * split.value.test),
}));

const PARTS: { key: keyof DatasetSplit; label: string; plain: string }[] = [
  { key: 'train', label: '训练集', plain: '模型从这部分学习空间关系。' },
  { key: 'val', label: '验证集', plain: '用来判断什么时候该停，不参与学习。' },
  { key: 'test', label: '测试集', plain: '完全不参与训练，最终精度以它为准。' },
];
</script>

<template>
  <div class="space-y-4">
    <div class="flex h-8 overflow-hidden rounded-xs border border-edge">
      <div class="grid place-items-center text-11 text-fg-invert" :style="{ width: `${split.train * 100}%`, background: 'var(--c-isoline)' }">训练</div>
      <div class="grid place-items-center text-11 text-fg-invert" :style="{ width: `${split.val * 100}%`, background: 'var(--c-graphite)' }">验证</div>
      <div class="grid place-items-center text-11 text-fg-invert" :style="{ width: `${split.test * 100}%`, background: 'var(--c-ochre)' }">测试</div>
    </div>

    <div v-for="p in PARTS" :key="p.key" class="grid grid-cols-[80px_1fr_120px] items-center gap-3">
      <label class="text-13">{{ p.label }}</label>
      <ElSlider :model-value="split[p.key]" :min="0.05" :max="0.9" :step="0.01"
                @update:model-value="store.setSplit(p.key, $event as number)" />
      <span class="num text-right text-13 text-fg-muted">
        {{ Math.round(split[p.key] * 100) }}% · {{ counts[p.key].toLocaleString() }} 条
      </span>
    </div>

    <p class="text-12 text-fg-faint">
      拖动任意一段，其余两段会按原比例吸收差值，三段之和始终为 100%。
    </p>
    <ul class="text-12 text-fg-muted">
      <li v-for="p in PARTS" :key="p.key">— {{ p.label }}：{{ p.plain }}</li>
    </ul>
  </div>
</template>
