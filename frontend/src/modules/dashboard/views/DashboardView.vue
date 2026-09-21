<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import MapStage from '@shared/components/MapStage.vue';
import BetaRibbon from '@modules/monitor/components/BetaRibbon.vue';
import LegendPanel from '../components/LegendPanel.vue';
import TimelinePlayer from '../components/TimelinePlayer.vue';
import CompareReport from '../components/CompareReport.vue';
import ResidualHistogram from '../components/ResidualHistogram.vue';
import FeatureInspector from '../components/FeatureInspector.vue';
import { useCoefficientField } from '../composables/useCoefficientField';
import { useMapChartLink } from '../composables/useMapChartLink';
import { modelApi, spatialApi, isAppError } from '@shared/api';
import { asId, type BBox, type FeatureId, type TaskId } from '@shared/types';
import { classOf, classify, type ClassifyMethod } from '@shared/viz/classify';
import { divergingColor, sequentialColor, symmetricMax } from '@shared/styles/data-color';
import { extent } from '@shared/viz/stats';
import { useSelectionStore, useTimelineStore, useUiStore } from '@stores/index';
import { toEpoch } from '@shared/utils/format';

const route = useRoute();
const taskId = computed(() => asId<TaskId>(String(route.params['taskId'])));
const ui = useUiStore();
const timeline = useTimelineStore();
const sel = useSelectionStore();

const { data: task } = useQuery({
  queryKey: computed(() => ['task', taskId.value]),
  queryFn: () => modelApi.status(taskId.value),
});
const { data: result, isPending: resultPending, error: resultError } = useQuery({
  queryKey: computed(() => ['result', taskId.value]),
  queryFn: () => modelApi.result(taskId.value),
});
const { data: comparison } = useQuery({
  queryKey: computed(() => ['compare', taskId.value]),
  queryFn: () => modelApi.compare(taskId.value),
});
const { data: surface } = useQuery({
  queryKey: computed(() => ['surface', taskId.value]),
  queryFn: () => spatialApi.surface(taskId.value),
  retry: false,
});

/* ── 视图状态 ── */
type LayerKind = 'coefficient' | 'residual' | 'local_r2';
const kind = ref<LayerKind>('coefficient');
const variable = ref<string | null>(null);
const method = ref<ClassifyMethod>('quantile');
const classCount = ref(7);
const surfaceVisible = ref(false);
const surfaceOpacity = ref(0.6);
const pointsVisible = ref(true);
const brushMode = ref(false);

const viewport = ref<{ bbox: BBox; zoom: number } | null>(null);
const { points, loading: coefLoading, error: coefError, paged } = useCoefficientField(taskId, viewport);

watch(result, (r) => {
  if (r && !variable.value) variable.value = r.coefficients_summary[0]?.variable ?? null;
});

/* 时间轴：由曲面的时间维度驱动。空间模式(GNNWR)下没有时间维度，播放器自动隐藏。 */
watch(surface, (s) => {
  timeline.setFrames(s?.time_dimension?.map((t) => toEpoch(t)) ?? []);
});

/* ── 取值 → 颜色。图例与地图共用这一份 breaks，从结构上杜绝不一致 ── */
const values = computed<number[]>(() => {
  const v = variable.value;
  return points.value.map((p) =>
    kind.value === 'coefficient' ? (v ? p.coefficients[v] ?? 0 : 0)
    : kind.value === 'residual' ? p.residual
    : p.local_r2 ?? 0);
});

const ramp = computed<'diverging' | 'sequential'>(() =>
  kind.value === 'local_r2' ? 'sequential' : 'diverging');

const range = computed<[number, number]>(() => (values.value.length ? extent(values.value) : [0, 1]));
const absMax = computed(() => {
  const s = result.value?.coefficients_summary.find((c) => c.variable === variable.value);
  return kind.value === 'coefficient' && s
    ? symmetricMax(s.q05, s.q95)
    : Math.max(Math.abs(range.value[0]), Math.abs(range.value[1])) || 1;
});
const breaks = computed(() => classify(values.value, method.value, classCount.value));

const ids = () => points.value.map((p) => p.feature_id as FeatureId);
const link = useMapChartLink(ids);

const colors = computed(() => {
  const bs = breaks.value;
  const edges = [range.value[0], ...bs, range.value[1]];
  return values.value.map((v) => {
    const c = classOf(v, bs);
    const mid = ((edges[c] ?? 0) + (edges[c + 1] ?? 0)) / 2;
    return ramp.value === 'diverging'
      ? divergingColor(mid, absMax.value, ui.resolved)
      : sequentialColor(mid, range.value[0], range.value[1], ui.resolved);
  });
});

const mapLayers = computed(() => {
  if (!pointsVisible.value || !points.value.length) return [];
  const xy = new Float64Array(points.value.length * 2);
  points.value.forEach((p, i) => {
    xy[i * 2] = p.geom.coordinates[0];
    xy[i * 2 + 1] = p.geom.coordinates[1];
  });
  return [{
    id: 'coef', xy, colors: colors.value,
    radius: 5, opacity: 0.9, visible: true, z: 2,
    highlight: link.brushedIndices.value,
  }];
});

const selectedPoint = computed(() =>
  link.selectedIndex.value !== null ? points.value[link.selectedIndex.value] ?? null : null);

const resultUnavailable = computed(() =>
  isAppError(resultError.value)
    && (resultError.value.code === 'CONTRACT_MISSING' || resultError.value.code === 'NOT_FOUND'));
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <!-- 地图是主角: 全屏舞台, 面板以蜡纸浮层叠在上面, 不做四宫格 -->
    <div class="relative min-h-0 flex-1">
      <MapStage
        :layers="mapLayers"
        :surface="surface ?? null"
        :surface-visible="surfaceVisible"
        :surface-opacity="surfaceOpacity"
        :surface-time="surface?.wms_time_supported && timeline.current !== null ? new Date(timeline.current).toISOString() : null"
        :brush="brushMode"
        @viewport="viewport = { bbox: $event.bbox, zoom: $event.zoom }"
        @click="link.selectIndex($event?.index ?? null)"
        @hover="link.hoverIndex($event?.index ?? null)"
        @brushed="$event ? link.brushFromMap($event.indices) : sel.clearBrush()"
      />

      <!-- 图层 -->
      <div v-if="ui.panels['layers']" class="absolute left-3 top-3 w-56 panel-mylar p-3">
        <p class="text-eyebrow">图层</p>
        <div class="mt-2 space-y-1">
          <label v-for="k in (['coefficient','residual','local_r2'] as LayerKind[])" :key="k"
                 class="flex items-center gap-2 text-13">
            <input type="radio" :value="k" :checked="kind === k" @change="kind = k" />
            {{ { coefficient: '回归系数', residual: '残差', local_r2: '局部 R²' }[k] }}
          </label>
        </div>

        <div v-if="kind === 'coefficient'" class="mt-2">
          <ElSelect v-model="variable" size="small" class="w-full">
            <ElOption v-for="c in result?.coefficients_summary ?? []" :key="c.variable"
                      :label="c.variable" :value="c.variable" />
          </ElSelect>
        </div>

        <div class="mt-3 space-y-1.5 border-t border-edge pt-2 text-13">
          <label class="flex items-center gap-2"><input v-model="pointsVisible" type="checkbox" /> 样本点位</label>
          <label class="flex items-center gap-2"><input v-model="surfaceVisible" type="checkbox" /> 反演曲面</label>
          <ElSlider v-if="surfaceVisible" v-model="surfaceOpacity" :min="0.1" :max="1" :step="0.05" size="small" />
          <p v-if="surfaceVisible && surface && surface.wms_time_supported === false" class="text-11 text-fg-faint">
            曲面暂不支持 WMS TIME，时间轴仅驱动点层动画。
          </p>
          <label class="flex items-center gap-2"><input v-model="brushMode" type="checkbox" /> 框选模式</label>
          <button v-if="sel.hasBrush" class="text-12 underline text-fg-muted" @click="sel.clearBrush()">
            清除框选（{{ sel.brushed.size }} 个）
          </button>
        </div>

        <p v-if="coefLoading" class="mt-2 text-11 text-fg-faint">图层载入中</p>
        <p v-if="paged === false" class="mt-2 text-11 text-fg-faint">
          后端未提供分页接口，已一次性载入全量。
        </p>
        <p v-if="coefError" class="mt-2 text-11 text-[var(--c-alarm)]">{{ coefError }}</p>
      </div>

      <!-- 图例 -->
      <div v-if="ui.panels['legend']" class="absolute bottom-3 left-3 w-56 panel-mylar p-3">
        <LegendPanel
          :title="kind === 'coefficient' ? `${variable ?? ''} 系数` : kind === 'residual' ? '残差' : '局部 R²'"
          :breaks="breaks" :ramp="ramp" :abs-max="absMax" :range="range"
          :method="method" :class-count="classCount"
          @update:method="method = $event" @update:class-count="classCount = $event" />
      </div>

      <!-- 系数带 / 样本明细 -->
      <div v-if="ui.panels['ribbon']" class="absolute right-3 top-3 max-h-[calc(100%-6rem)] w-72 overflow-auto panel-mylar p-3">
        <FeatureInspector v-if="selectedPoint && result"
                          :point="selectedPoint" :summaries="result.coefficients_summary"
                          :y-column="task?.y_column ?? 'Y'"
                          @close="link.selectIndex(null)" />
        <template v-else-if="result">
          <p class="text-eyebrow">系数带 · 全域分布</p>
          <p class="mt-1 text-11 text-fg-faint">点击地图上任一点位可看该处的局部值。</p>
          <div class="mt-2 space-y-3">
            <BetaRibbon v-for="c in result.coefficients_summary" :key="c.variable" :summary="c" size="card" />
          </div>
        </template>
        <div v-else-if="resultPending"><ElSkeleton animated :rows="4" /></div>
        <p v-else-if="resultUnavailable" class="text-13 text-fg-muted">
          结果接口不可用。请确认 API 指向 gnnwr_platform_backend（非 monorepo 旧 backend）。
        </p>
      </div>

      <!-- 精度与残差 -->
      <div v-if="ui.panels['metrics'] && result" class="absolute bottom-3 right-3 w-80 max-h-[60%] overflow-auto panel-mylar p-3">
        <p class="text-eyebrow">精度对比</p>
        <CompareReport v-if="comparison" class="mt-1" :comparison="comparison" />
        <div class="mt-4 border-t border-edge pt-3">
          <p class="text-eyebrow">残差分布</p>
          <ResidualHistogram class="mt-1" :summary="result.residual_summary" />
        </div>
      </div>

      <button class="absolute right-3 top-1/2 panel-mylar px-2 py-1 text-11"
              @click="ui.setAllPanels(!ui.panels['layers'])">
        {{ ui.panels['layers'] ? '收起面板' : '展开面板' }}
      </button>
    </div>

    <div v-if="timeline.hasFrames" class="shrink-0 border-t border-edge">
      <TimelinePlayer />
    </div>
  </div>
</template>
