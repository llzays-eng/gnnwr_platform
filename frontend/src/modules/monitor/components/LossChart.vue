<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useUiStore } from '@stores/index';

// 按需引入: 全量 ECharts 约 1MB，只用折线图没必要全带上
echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

const props = defineProps<{ history: readonly (readonly [number, number, number])[] }>();
const el = ref<HTMLElement | null>(null);
const ui = useUiStore();
let chart: echarts.ECharts | null = null;
let ro: ResizeObserver | null = null;

function render(): void {
  if (!chart) return;
  const fg = getComputedStyle(document.documentElement).getPropertyValue('--fg-muted').trim();
  chart.setOption({
    animation: !ui.reducedMotion,
    grid: { left: 44, right: 12, top: 28, bottom: 28 },
    tooltip: { trigger: 'axis' },
    legend: { data: ['训练集', '验证集'], textStyle: { color: fg }, top: 0, right: 0 },
    xAxis: { type: 'category', name: 'epoch', nameTextStyle: { color: fg }, axisLabel: { color: fg },
             data: props.history.map((h) => h[0]) },
    yAxis: { type: 'value', name: 'loss', nameTextStyle: { color: fg }, axisLabel: { color: fg },
             splitLine: { lineStyle: { opacity: 0.15 } } },
    series: [
      { name: '训练集', type: 'line', showSymbol: false, smooth: true,
        lineStyle: { width: 1.5, color: '#0F7C7B' }, data: props.history.map((h) => h[1]) },
      { name: '验证集', type: 'line', showSymbol: false, smooth: true,
        lineStyle: { width: 1.5, color: '#C2611D' }, data: props.history.map((h) => h[2]) },
    ],
  });
}

onMounted(() => {
  chart = echarts.init(el.value!, undefined, { renderer: 'canvas' });
  ro = new ResizeObserver(() => chart?.resize());
  ro.observe(el.value!);
  render();
});
onBeforeUnmount(() => { ro?.disconnect(); chart?.dispose(); });
watch(() => [props.history, ui.resolved], render, { deep: false });
</script>

<template>
  <div v-if="history.length" ref="el" class="h-56 w-full" />
  <div v-else class="grid h-56 place-items-center text-13 text-fg-muted">等待第一轮训练完成</div>
</template>
