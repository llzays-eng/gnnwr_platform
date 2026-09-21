<script setup lang="ts">
import { computed } from 'vue';
import type { CoefficientSummary } from '@shared/types';
import { divergingColor, symmetricMax } from '@shared/styles/data-color';
import { signed } from '@shared/utils/format';
import { useUiStore } from '@stores/index';

/**
 * 系数带 β-Ribbon —— 平台的记忆点。
 *
 * 规则: 在这个平台上，回归系数永远不以单个数字出现。
 * 任何本该打印 β = 0.42 的位置，打印的是一条带 ——
 * 横轴是系数取值，零点固定居中锚定，发散色带填充，
 * 当前点位的局部值用一根竖标记标出。
 *
 * 全局模型(OLS/随机森林)没有空间变系数，std 为 0，
 * 于是这条带自然塌缩成一根线 —— 这不是渲染退化，
 * 这正是"为什么不用全局模型"这句话的视觉形式。
 *
 * 零点固定居中、不随数据范围漂移: 否则一个全正的系数场
 * 会被涂成"有正有负"的样子，那是严重误读。
 */
const props = withDefaults(defineProps<{
  summary: CoefficientSummary;
  /** 当前选中点位的局部系数值 */
  local?: number | null;
  /** 用于对齐多个变量的共同标尺；不传则各自独立 */
  scale?: number | null;
  size?: 'inline' | 'card' | 'hero';
  showLabel?: boolean;
}>(), { local: null, scale: null, size: 'card', showLabel: true });

const ui = useUiStore();
const H = { inline: 14, card: 48, hero: 96 } as const;
const height = computed(() => H[props.size]);

const absMax = computed(() => props.scale ?? symmetricMax(props.summary.q05, props.summary.q95));
const collapsed = computed(() => props.summary.std === 0 || props.summary.max === props.summary.min);

/** 值 → 0~100 的横向百分比，50% 恒为零点 */
const pos = (v: number): number => 50 + (Math.max(-1, Math.min(1, v / absMax.value)) * 50);

/** 分位数分段：q05-q25-q50-q75-q95，中间段最浓，两端渐淡，构成"带"的形状 */
const bands = computed(() => {
  const s = props.summary;
  const segs: { from: number; to: number; alpha: number; value: number }[] = [
    { from: pos(s.q05), to: pos(s.q25), alpha: 0.35, value: (s.q05 + s.q25) / 2 },
    { from: pos(s.q25), to: pos(s.q50), alpha: 0.75, value: (s.q25 + s.q50) / 2 },
    { from: pos(s.q50), to: pos(s.q75), alpha: 0.75, value: (s.q50 + s.q75) / 2 },
    { from: pos(s.q75), to: pos(s.q95), alpha: 0.35, value: (s.q75 + s.q95) / 2 },
  ];
  return segs.map((g) => ({ ...g, color: divergingColor(g.value, absMax.value, ui.resolved) }));
});

const flipped = computed(() => props.summary.positive_ratio > 0.15 && props.summary.positive_ratio < 0.85);
</script>

<template>
  <div>
    <div v-if="showLabel" class="flex items-baseline gap-2">
      <span class="num text-13">{{ summary.variable }}</span>
      <span class="num text-12 text-fg-muted">均值 {{ signed(summary.mean) }}</span>
      <span v-if="flipped" class="text-11 text-[var(--c-ochre)]" title="该变量的作用方向在空间上发生翻转">
        方向翻转 {{ Math.round(summary.positive_ratio * 100) }}% 为正
      </span>
      <span v-if="collapsed" class="text-11 text-fg-faint">全局模型 · 无空间变化</span>
    </div>

    <div class="relative mt-1 w-full overflow-hidden rounded-none"
         :style="{ height: `${height}px`, background: 'var(--ramp-zero)' }"
         role="img"
         :aria-label="`${summary.variable} 的系数分布，从 ${summary.min.toFixed(2)} 到 ${summary.max.toFixed(2)}，均值 ${summary.mean.toFixed(2)}${local !== null ? `，当前点位 ${local.toFixed(2)}` : ''}`">

      <template v-if="!collapsed">
        <div v-for="(b, i) in bands" :key="i" class="absolute top-0 h-full"
             :style="{ left: `${Math.min(b.from, b.to)}%`, width: `${Math.abs(b.to - b.from)}%`,
                       background: b.color, opacity: b.alpha }" />
      </template>
      <!-- 塌缩形态：全局模型只有一根线 -->
      <div v-else class="absolute top-1/2 h-0.5 -translate-y-1/2"
           :style="{ left: `${Math.min(pos(summary.mean), 50)}%`,
                     width: `${Math.abs(pos(summary.mean) - 50)}%`,
                     background: 'var(--c-graphite)' }" />

      <!-- 零点锚：非颜色编码，去色后仍可读 -->
      <div class="absolute top-0 h-full w-px" style="left: 50%; background: var(--edge-strong)" />

      <!-- 局部值标记 -->
      <div v-if="local !== null" class="absolute top-0 h-full w-0.5"
           :style="{ left: `${pos(local)}%`, background: 'var(--fg)' }" />
    </div>

    <div v-if="size !== 'inline'" class="mt-0.5 flex justify-between text-11 text-fg-faint">
      <span class="num">{{ signed(summary.q05, 2) }}</span>
      <span>0</span>
      <span class="num">{{ signed(summary.q95, 2) }}</span>
    </div>
  </div>
</template>
