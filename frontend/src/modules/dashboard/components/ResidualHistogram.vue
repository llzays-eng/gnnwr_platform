<script setup lang="ts">
import { computed } from 'vue';
import type { ResidualSummary } from '@shared/types';
import { num } from '@shared/utils/format';

const props = defineProps<{ summary: ResidualSummary }>();
const max = computed(() => Math.max(...props.summary.histogram.map((h) => h[1]), 1));
</script>

<template>
  <div>
    <div class="flex h-24 items-end gap-px">
      <div v-for="(h, i) in summary.histogram" :key="i"
           class="flex-1"
           :style="{ height: `${(h[1] / max) * 100}%`,
                     background: h[0] < 0 ? 'var(--c-isoline)' : 'var(--c-ochre)', opacity: 0.75 }"
           :title="`${num(h[0], 1)} 起 · ${h[1]} 条`" />
    </div>
    <div class="num mt-1 flex justify-between text-11 text-fg-faint">
      <span>{{ num(summary.min, 1) }}</span><span>0</span><span>{{ num(summary.max, 1) }}</span>
    </div>
    <dl class="num mt-2 space-y-0.5 text-12">
      <div class="flex justify-between"><dt class="text-fg-muted">均值 / 标准差</dt><dd>{{ num(summary.mean, 2) }} / {{ num(summary.std, 2) }}</dd></div>
      <div v-if="summary.morans_i !== null" class="flex justify-between">
        <dt class="text-fg-muted">残差 Moran's I</dt><dd>{{ num(summary.morans_i, 3) }}</dd>
      </div>
    </dl>
    <p v-if="(summary.morans_i ?? 0) > 0.1" class="mt-1 text-11 text-[var(--c-ochre)]">
      残差仍有显著空间自相关，说明模型漏掉了部分空间结构。可以考虑补充协变量。
    </p>
  </div>
</template>
