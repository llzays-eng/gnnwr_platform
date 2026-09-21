<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';
import { useTimelineStore, useUiStore } from '@stores/index';
import { fmtDate } from '@shared/utils/format';

/**
 * 时间轴播放器。
 *
 * 状态全在 store 里 —— 它要同时驱动地图图层、统计图和系数带，
 * 任何一个把它私有化，联动就退化成层层透传。
 */
const t = useTimelineStore();
const ui = useUiStore();
const SPEEDS = [0.5, 1, 2, 4];
let timer: number | null = null;

function tick(): void {
  if (timer) clearInterval(timer);
  if (t.play !== 'playing') return;
  timer = window.setInterval(() => { t.step(1); }, 900 / t.speed);
}
watch(() => [t.play, t.speed], tick, { immediate: true });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>

<template>
  <div v-if="t.hasFrames" class="flex items-center gap-3 px-3 py-2">
    <button class="text-14" aria-label="上一帧" @click="t.step(-1)">◀◀</button>
    <button class="text-16" :aria-label="t.play === 'playing' ? '暂停' : '播放'" @click="t.toggle()">
      {{ t.play === 'playing' ? '❙❙' : '▶' }}
    </button>
    <button class="text-14" aria-label="下一帧" @click="t.step(1)">▶▶</button>

    <span class="num w-24 shrink-0 text-13">{{ t.current !== null ? fmtDate(t.current) : '—' }}</span>

    <ElSlider :model-value="t.index" :min="0" :max="Math.max(0, t.total - 1)" :step="1"
              :show-tooltip="false" class="min-w-0 flex-1" @update:model-value="t.seek($event as number)" />

    <ElSelect :model-value="t.speed" size="small" style="width: 78px"
              @update:model-value="t.speed = $event as number">
      <ElOption v-for="s in SPEEDS" :key="s" :label="`${s}×`" :value="s" />
    </ElSelect>

    <button class="text-12" :class="t.loop ? 'text-[var(--c-signal)]' : 'text-fg-muted'"
            :aria-pressed="t.loop" @click="t.loop = !t.loop">循环</button>

    <span class="num text-11 text-fg-faint">{{ t.index + 1 }} / {{ t.total }}</span>
    <span v-if="ui.reducedMotion" class="text-11 text-fg-faint">已按系统偏好关闭动画</span>
  </div>
</template>
