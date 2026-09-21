<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { createMapAdapter } from '@shared/map';
import type { MapAdapter, PointLayerInput, Viewport } from '@shared/map';
import { makeBuffer, projectBuffer } from '@shared/geo';
import type { BBox, SurfaceLayerInfo } from '@shared/types';
import { useUiStore } from '@stores/index';

/**
 * 地图舞台。
 *
 * 唯一职责: 持有适配器实例, 并在数据进入渲染层前完成坐标系转换。
 * 业务组件通过 props 传【WGS84】坐标 —— 后端契约就是 WGS84,
 * 让业务层去关心 GCJ-02 只会把纠偏逻辑散出去。
 */
const props = withDefaults(defineProps<{
  /** 一律 WGS84。适配器需要什么坐标系由适配器自己声明。 */
  layers: PointLayerInput[];
  fit?: BBox | null;
  surface?: SurfaceLayerInfo | null;
  surfaceOpacity?: number;
  surfaceVisible?: boolean;
  surfaceTime?: string | null;
  brush?: boolean;
  center?: [number, number];
  zoom?: number;
}>(), {
  fit: null, surface: null, surfaceOpacity: 0.6, surfaceVisible: false,
  surfaceTime: null, brush: false, center: () => [120.5, 31.1], zoom: 7,
});

const emit = defineEmits<{
  viewport: [Viewport];
  hover: [{ index: number; layerId: string } | null];
  click: [{ index: number; layerId: string } | null];
  brushed: [{ layerId: string; indices: number[] } | null];
  ready: [MapAdapter];
}>();

const host = ref<HTMLElement | null>(null);
const adapter = shallowRef<MapAdapter | null>(null);
const notice = ref<string | null>(null);
const crsWarning = ref<string | null>(null);
const ui = useUiStore();
let offs: (() => void)[] = [];

/** 把 WGS84 转成适配器要求的坐标系。少了这一步 = 偏移 500 米。 */
function toRender(xy: Float64Array): Float64Array {
  const a = adapter.value;
  if (!a || a.renderCrs === 'WGS84') return xy;
  return projectBuffer(a.renderCrs, makeBuffer('WGS84', xy)).xy;
}

function syncLayers(): void {
  const a = adapter.value;
  if (!a) return;
  for (const l of props.layers) a.upsertPointLayer({ ...l, xy: toRender(l.xy) });
}

function syncSurface(): void {
  const a = adapter.value;
  if (!a) return;
  a.setSurface(props.surface, {
    opacity: props.surfaceOpacity,
    visible: props.surfaceVisible,
    time: props.surfaceTime,
  });
  // 栅格无法逐点纠偏 —— 这是全项目最高风险项, 必须显式告知而不是默默贴上去
  crsWarning.value =
    props.surface && props.surfaceVisible && props.surface.tile_crs !== a.renderCrs
      ? `曲面切片为 ${props.surface.tile_crs}，底图为 ${a.renderCrs}，存在约 300~600m 系统性偏移。栅格无法逐点纠偏，处置见「风险-栅格偏移」。`
      : null;
}

onMounted(async () => {
  const a = await createMapAdapter();
  await a.mount(host.value!, { center: props.center, zoom: props.zoom, theme: ui.resolved });
  adapter.value = a;
  notice.value = a.notice;
  offs = [
    a.on('viewport', (v) => { emit('viewport', v); }),
    a.on('hover', (h) => { emit('hover', h); }),
    a.on('click', (c) => { emit('click', c); }),
    a.on('brush', (b) => { emit('brushed', b); }),
  ];
  syncLayers();
  syncSurface();
  if (props.fit) a.fitBounds(props.fit);
  a.setBrushMode(props.brush);
  emit('ready', a);
});

onBeforeUnmount(() => { offs.forEach((f) => { f(); }); adapter.value?.destroy(); });

watch(() => props.layers, syncLayers, { deep: false });
watch(() => [props.surface, props.surfaceOpacity, props.surfaceVisible, props.surfaceTime], syncSurface);
watch(() => props.fit, (b) => { if (b) adapter.value?.fitBounds(b); });
watch(() => props.brush, (v) => { adapter.value?.setBrushMode(v); });
watch(() => ui.resolved, (t) => { adapter.value?.setTheme(t); });
</script>

<template>
  <div class="relative h-full w-full">
    <div ref="host" class="h-full w-full" />

    <div v-if="notice" class="pointer-events-none absolute left-3 top-3 panel-mylar px-3 py-1.5 text-12 text-fg-muted">
      {{ notice }}
    </div>

    <div v-if="crsWarning" role="alert"
         class="absolute right-3 top-3 max-w-xs panel-mylar border border-[var(--c-alarm)] px-3 py-2 text-12">
      {{ crsWarning }}
    </div>

    <div v-if="!adapter" class="absolute inset-0 grid place-items-center text-fg-muted">
      地图载入中
    </div>

    <slot />
  </div>
</template>
