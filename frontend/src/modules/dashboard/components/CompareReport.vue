<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { RadarChart } from 'echarts/charts';
import { LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { BaselineComparison, MetricKey } from '@shared/types';
import { BASELINE_LABEL, METRIC_DIRECTION, METRIC_LABEL } from '@shared/types';
import { normalizeMetric } from '@shared/viz/stats';
import { num } from '@shared/utils/format';
import { useUiStore } from '@stores/index';

echarts.use([RadarChart, TooltipComponent, LegendComponent, CanvasRenderer]);

const props = defineProps<{ comparison: BaselineComparison }>();
const el = ref<HTMLElement | null>(null);
const ui = useUiStore();
let chart: echarts.ECharts | null = null;
let ro: ResizeObserver | null = null;

const METRICS: MetricKey[] = ['r2', 'rmse', 'mae', 'aicc'];

/**
 * ★ 雷达图必须先做方向归一化。
 *
 * R² 越大越好，RMSE/MAE/AICc 越小越好。把四个原始值直接画进雷达图，
 * 得到的形状是【误导性的】: 差模型的 RMSE 大，反而把雷达撑得更满。
 * 归一化后统一为"越靠外越好"，图形才和结论一致。
 */
const normalized = computed(() =>
  props.comparison.entries.map((e) => ({
    name: BASELINE_LABEL[e.model],
    isTarget: e.is_target,
    values: METRICS.map((m) =>
      normalizeMetric(e[m], props.comparison.entries.map((x) => x[m]), METRIC_DIRECTION[m])),
  })));

function render(): void {
  if (!chart) return;
  const fg = getComputedStyle(document.documentElement).getPropertyValue('--fg-muted').trim();
  chart.setOption({
    animation: !ui.reducedMotion,
    tooltip: {},
    legend: { bottom: 0, textStyle: { color: fg }, type: 'scroll' },
    radar: {
      indicator: METRICS.map((m) => ({ name: METRIC_LABEL[m], max: 1 })),
      axisName: { color: fg },
      splitLine: { lineStyle: { opacity: 0.2 } },
      splitArea: { show: false },
    },
    series: [{
      type: 'radar',
      data: normalized.value.map((d) => ({
        name: d.name,
        value: d.values,
        lineStyle: { width: d.isTarget ? 2.5 : 1, color: d.isTarget ? '#6B4DF0' : undefined },
        areaStyle: d.isTarget ? { opacity: 0.15 } : undefined,
      })),
    }],
  });
}

onMounted(() => {
  chart = echarts.init(el.value!);
  ro = new ResizeObserver(() => chart?.resize());
  ro.observe(el.value!);
  render();
});
onBeforeUnmount(() => { ro?.disconnect(); chart?.dispose(); });
watch(() => [props.comparison, ui.resolved], render, { deep: false });
</script>

<template>
  <div>
    <div ref="el" class="h-64 w-full" />
    <p class="text-11 text-fg-faint">
      雷达图各轴已按指标方向归一化（RMSE/MAE/AICc 取反），统一为越靠外越好。原始值见下表。
    </p>

    <table class="mt-3 w-full text-13" style="table-layout: fixed">
      <thead>
        <tr class="border-b border-edge text-left">
          <th class="py-1.5 font-normal text-fg-muted">模型</th>
          <th v-for="m in METRICS" :key="m" class="py-1.5 text-right font-normal text-fg-muted">
            {{ METRIC_LABEL[m] }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="e in comparison.entries" :key="e.model" class="border-b border-edge last:border-0">
          <td class="py-1.5" :class="e.is_target ? 'text-[var(--c-signal)]' : ''">
            {{ BASELINE_LABEL[e.model] }}
          </td>
          <td v-for="m in METRICS" :key="m" class="num py-1.5 text-right"
              :class="comparison.best_by_metric[m] === e.model ? 'text-[var(--c-isoline)]' : ''">
            {{ num(e[m], 3) }}
            <span v-if="comparison.best_by_metric[m] === e.model" aria-label="最优">▪</span>
          </td>
        </tr>
      </tbody>
    </table>
    <p class="mt-1 text-11 text-fg-faint">▪ 标记为该指标最优。随机森林无 AICc，显示为 —。</p>
  </div>
</template>
