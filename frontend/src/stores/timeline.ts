import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export type PlayState = 'stopped' | 'playing' | 'paused';

/**
 * 时间轴。
 *
 * 独立成 store 而不是塞进 layer, 是因为它要同时驱动
 * 地图图层、统计图表和系数带三者 —— 任何一个把它私有化,
 * 联动就会退化成层层透传。
 *
 * 内部一律 epoch 毫秒, 只在渲染时格式化。
 * 状态机: stopped → playing ⇄ paused → stopped
 */
export const useTimelineStore = defineStore('timeline', () => {
  /** 可用时刻, 升序。由 SurfaceLayerInfo.time_dimension 或数据集时间列填充。 */
  const frames = ref<number[]>([]);
  const index = ref(0);
  const play = ref<PlayState>('stopped');
  const speed = ref(1);
  const loop = ref(true);

  const current = computed<number | null>(() => frames.value[index.value] ?? null);
  const total = computed(() => frames.value.length);
  const hasFrames = computed(() => frames.value.length > 0);

  /** 当前帧的时间区间, 供 /spatial/tiles 的 time 参数用 */
  const frameWindow = computed<[number, number] | null>(() => {
    const c = current.value;
    if (c === null) return null;
    const next = frames.value[index.value + 1] ?? c + 86_400_000;
    return [c, next - 1];
  });

  function setFrames(list: number[]): void {
    frames.value = [...list].sort((a, b) => a - b);
    index.value = 0;
    play.value = 'stopped';
  }

  function seek(i: number): void {
    if (total.value === 0) return;
    index.value = Math.max(0, Math.min(total.value - 1, i));
  }

  function step(delta: number): void {
    if (total.value === 0) return;
    const next = index.value + delta;
    if (next >= total.value) {
      if (loop.value) index.value = 0;
      else { index.value = total.value - 1; play.value = 'stopped'; }
    } else if (next < 0) {
      index.value = loop.value ? total.value - 1 : 0;
    } else {
      index.value = next;
    }
  }

  const start = () => { if (hasFrames.value) play.value = 'playing'; };
  const pause = () => { if (play.value === 'playing') play.value = 'paused'; };
  const stop = () => { play.value = 'stopped'; index.value = 0; };
  const toggle = () => { play.value === 'playing' ? pause() : start(); };

  return { frames, index, play, speed, loop, current, total, hasFrames, frameWindow,
    setFrames, seek, step, start, pause, stop, toggle };
});
