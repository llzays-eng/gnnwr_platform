<script setup lang="ts">
import type { CoefficientPoint, CoefficientSummary } from '@shared/types';
import BetaRibbon from '@modules/monitor/components/BetaRibbon.vue';
import { num, signed } from '@shared/utils/format';

defineProps<{
  point: CoefficientPoint;
  summaries: readonly CoefficientSummary[];
  yColumn: string;
}>();
defineEmits<{ close: [] }>();
</script>

<template>
  <div>
    <div class="flex items-baseline gap-2">
      <p class="text-eyebrow">样本明细</p>
      <button class="ml-auto text-12 text-fg-muted" @click="$emit('close')">关闭</button>
    </div>

    <dl class="num mt-2 space-y-0.5 text-12">
      <div class="flex justify-between"><dt class="text-fg-muted">坐标</dt>
        <dd>{{ point.geom.coordinates[0].toFixed(4) }}, {{ point.geom.coordinates[1].toFixed(4) }}</dd></div>
      <div class="flex justify-between"><dt class="text-fg-muted">实测 {{ yColumn }}</dt><dd>{{ num(point.observed, 2) }}</dd></div>
      <div class="flex justify-between"><dt class="text-fg-muted">预测</dt><dd>{{ num(point.predicted, 2) }}</dd></div>
      <div class="flex justify-between"><dt class="text-fg-muted">残差</dt>
        <dd :class="Math.abs(point.residual) > Math.abs(point.observed) * 0.2 ? 'text-[var(--c-ochre)]' : ''">
          {{ signed(point.residual, 2) }}
        </dd></div>
      <div v-if="point.local_r2 !== null" class="flex justify-between">
        <dt class="text-fg-muted">局部 R²</dt><dd>{{ num(point.local_r2, 3) }}</dd></div>
    </dl>

    <p class="mt-3 text-eyebrow">此处的局部系数</p>
    <p class="mt-1 text-11 text-fg-faint">竖线是这一点的值，色带是全域分布 —— 差距就是空间非平稳性。</p>
    <div class="mt-2 space-y-2.5">
      <BetaRibbon v-for="s in summaries" :key="s.variable" :summary="s"
                  :local="point.coefficients[s.variable] ?? null" size="card" />
    </div>
  </div>
</template>
