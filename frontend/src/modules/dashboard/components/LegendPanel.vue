<script setup lang="ts">
import { computed } from 'vue';
import { CLASSIFY_LABEL, type ClassifyMethod } from '@shared/viz/classify';
import { divergingColor, sequentialColor } from '@shared/styles/data-color';
import { num } from '@shared/utils/format';
import { useUiStore } from '@stores/index';

/**
 * 图例。
 *
 * 关键: breaks 由 layer store 提供，与地图取色用的是【同一份】数据。
 * 图例自己算一遍分级是"图例与地图不一致"的唯一成因，这里从结构上排除。
 */
const props = defineProps<{
  title: string;
  breaks: number[];
  ramp: 'diverging' | 'sequential';
  absMax: number;
  range: [number, number];
  method: ClassifyMethod;
  classCount: number;
}>();
const emit = defineEmits<{ 'update:method': [ClassifyMethod]; 'update:classCount': [number] }>();
const ui = useUiStore();

const cells = computed(() => {
  const edges = [props.range[0], ...props.breaks, props.range[1]];
  return edges.slice(0, -1).map((lo, i) => {
    const hi = edges[i + 1]!;
    const mid = (lo + hi) / 2;
    return {
      lo, hi,
      color: props.ramp === 'diverging'
        ? divergingColor(mid, props.absMax, ui.resolved)
        : sequentialColor(mid, props.range[0], props.range[1], ui.resolved),
    };
  });
});
</script>

<template>
  <div>
    <p class="text-eyebrow">{{ title }}</p>

    <div class="mt-2 flex h-4 w-full overflow-hidden">
      <div v-for="(c, i) in cells" :key="i" class="flex-1" :style="{ background: c.color }" />
    </div>
    <div class="num mt-1 flex justify-between text-11 text-fg-faint">
      <span>{{ num(range[0], 2) }}</span>
      <span v-if="ramp === 'diverging'">0</span>
      <span>{{ num(range[1], 2) }}</span>
    </div>
    <p v-if="ramp === 'diverging'" class="mt-1 text-11 text-fg-muted">
      青为负、赭为正，零值居中。去色后仍呈深—浅—深。
    </p>

    <div class="mt-3 space-y-2">
      <div>
        <label class="text-11 text-fg-muted">分级方式</label>
        <ElSelect :model-value="method" size="small" class="mt-1 w-full"
                  @update:model-value="emit('update:method', $event as ClassifyMethod)">
          <ElOption v-for="(m, k) in CLASSIFY_LABEL" :key="k" :label="m.label" :value="k" />
        </ElSelect>
        <p class="mt-1 text-11 text-fg-faint">{{ CLASSIFY_LABEL[method].plain }}</p>
      </div>
      <div>
        <label class="text-11 text-fg-muted">分级数 {{ classCount }}</label>
        <ElSlider :model-value="classCount" :min="3" :max="11" :step="2" size="small"
                  @update:model-value="emit('update:classCount', $event as number)" />
      </div>
    </div>
  </div>
</template>
