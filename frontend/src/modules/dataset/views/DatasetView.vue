<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import MapStage from '@shared/components/MapStage.vue';
import UploadDropzone from '../components/UploadDropzone.vue';
import FieldTable from '../components/FieldTable.vue';
import StatusBanner from '../components/StatusBanner.vue';
import { useUpload } from '../composables/useUpload';
import { inferColumns, suggestCrs } from '../composables/useColumnInference';
import { datasetApi, isAppError } from '@shared/api';
import { asId, CRS_LABEL, type Dataset, type ProjectId, type SourceCRS } from '@shared/types';
import { looksSwapped, makeBuffer, offshoreRatio, bboxOf, projectBuffer } from '@shared/geo';
import { useDatasetStore } from '@stores/index';
import { bytes } from '@shared/utils/format';

const route = useRoute();
const router = useRouter();
const projectId = computed(() => asId<ProjectId>(String(route.params['projectId'])));
const store = useDatasetStore();

const upload = useUpload(projectId.value);
const dataset = ref<Dataset | null>(null);
const showTable = ref(false);
const submitting = ref(false);
const submitError = ref<string | null>(null);

/** 演示项目里已有数据集, 直接列出来 —— 否则用户进来只能看到一个空上传框。 */
const { data: list, isPending: listPending, error: listError } = useQuery({
  queryKey: ['datasets', projectId.value],
  queryFn: () => datasetApi.list(projectId.value),
});

watch(list, (v) => { if (!dataset.value && v?.items.length) select(v.items[0]!); }, { immediate: true });

const { data: preview, isPending: previewPending } = useQuery({
  queryKey: computed(() => ['preview', dataset.value?.id ?? '']),
  queryFn: () => datasetApi.preview(dataset.value!.id, 20),
  enabled: computed(() => dataset.value !== null),
});

function select(ds: Dataset): void {
  dataset.value = ds;
  store.current = ds;
  store.resetOverrides();
  const g = inferColumns(ds.schema);
  // 置信度不足时不预选, 只提示 —— 猜错比不猜更糟
  if (g.confidence >= 0.6) {
    store.overrides.longitude = g.longitude;
    store.overrides.latitude = g.latitude;
    store.overrides.temporal = g.temporal;
  }
  store.overrides.sourceCrs = ds.source_crs;
}

const guess = computed(() => (dataset.value ? inferColumns(dataset.value.schema) : null));
const columns = computed(() => dataset.value?.schema.map((s) => s.name) ?? []);

/** 离岸哨兵。表格里 100% 看不出坐标错配, 地图上一秒就能看出来。 */
const sentinel = computed(() => {
  // 预览阶段只消费 spatial_sample（源 CRS 语义明确）。
  // 后端兼容字段 points(通常已是 GCJ) 在前端不使用，避免双语义混用。
  const sample = preview.value?.spatial_sample;
  if (!sample?.length) return null;
  const xy = new Float64Array(sample.length * 2);
  sample.forEach((c, i) => { xy[i * 2] = c[0]; xy[i * 2 + 1] = c[1]; });
  const buf = makeBuffer(store.effective.sourceCrs ?? 'WGS84', xy);
  // MapStage 约定入参一律 WGS84，这里把用户当前选择的 source_crs 解释结果统一投到 WGS84。
  const wgs = projectBuffer('WGS84', buf);
  return { ...suggestCrs(offshoreRatio(buf), looksSwapped(buf)), buf, wgs };
});

const mapLayers = computed(() => {
  const s = sentinel.value;
  if (!s) return [];
  const n = s.wgs.count;
  const bad = s.level !== 'ok';
  return [{
    id: 'preview',
    xy: s.wgs.xy,
    colors: new Array<string>(n).fill(bad ? '#C2611D' : '#0F7C7B'),
    radius: 3.5, opacity: 0.85, visible: true, z: 1, highlight: null,
  }];
});
const fit = computed(() => (sentinel.value ? bboxOf(sentinel.value.wgs) : null));

async function ingest(): Promise<void> {
  const ds = dataset.value;
  const e = store.effective;
  if (!ds || !e.sourceCrs || !e.longitude || !e.latitude) return;
  submitting.value = true;
  submitError.value = null;
  try {
    const updated = await datasetApi.preprocess(ds.id, {
      source_crs: e.sourceCrs,
      longitude_column: e.longitude,
      latitude_column: e.latitude,
      ...(e.temporal ? { temporal_column: e.temporal } : {}),
      drop_invalid_rows: true,
    });
    dataset.value = updated;
    store.current = updated;
  } catch (err) {
    submitError.value = isAppError(err) ? err.message : '入库失败，请重试。';
  } finally {
    submitting.value = false;
  }
}

const canIngest = computed(() =>
  Boolean(store.effective.sourceCrs && store.effective.longitude && store.effective.latitude));

function swapLngLat(): void {
  const { longitude, latitude } = store.effective;
  store.overrides.longitude = latitude;
  store.overrides.latitude = longitude;
}

async function onPick(f: File): Promise<void> {
  const ds = await upload.start(f);
  if (ds) select(ds);
}
</script>

<template>
  <div class="flex h-full min-h-0">
    <!-- 左栏: 控制。地图占主区域, 表格默认收起 —— 见设计方案 §8.2 -->
    <aside class="w-80 shrink-0 overflow-auto border-r border-edge p-4">
      <p class="text-eyebrow">阶段 1</p>
      <h2 class="mt-1 text-20">数据接入</h2>

      <div v-if="listPending" class="mt-4"><ElSkeleton animated :rows="3" /></div>
      <p v-else-if="listError && isAppError(listError) && listError.code === 'NOT_FOUND'"
         class="mt-4 rounded-sm border border-edge p-3 text-13 text-fg-muted">
        数据集列表接口返回 404。请确认 API 指向 gnnwr_platform_backend（非 monorepo 旧 backend）。
      </p>

      <div v-if="list?.items.length" class="mt-4 space-y-1">
        <button v-for="d in list.items" :key="d.id"
                class="w-full rounded-sm border px-3 py-2 text-left text-13"
                :class="dataset?.id === d.id ? 'border-[var(--c-signal)]' : 'border-edge'"
                @click="select(d)">
          <span class="block truncate">{{ d.filename }}</span>
          <span class="num text-12 text-fg-muted">{{ d.row_count.toLocaleString() }} 行 · {{ bytes(d.size_bytes) }}</span>
        </button>
      </div>

      <div class="mt-4">
        <UploadDropzone :progress="upload.state.value.progress" :phase="upload.state.value.phase"
                        :message="upload.state.value.message" @pick="onPick" />
      </div>

      <template v-if="dataset">
        <div class="mt-4"><StatusBanner :dataset="dataset" @retry="dataset = null" /></div>

        <div class="mt-4 space-y-3">
          <div>
            <label class="text-eyebrow">原始坐标系</label>
            <ElSelect v-model="store.overrides.sourceCrs" class="mt-1 w-full" placeholder="必须显式确认">
              <ElOption v-for="(label, k) in CRS_LABEL" :key="k" :label="label" :value="k" />
            </ElSelect>
            <p class="mt-1 text-12 text-fg-faint">后端统一按 WGS84 计算，必须先声明数据本身是什么坐标系。</p>
          </div>

          <div v-for="f in ([['longitude','经度列'],['latitude','纬度列'],['temporal','时间列（可选）']] as const)" :key="f[0]">
            <label class="text-eyebrow">{{ f[1] }}</label>
            <ElSelect v-model="store.overrides[f[0]]" class="mt-1 w-full" clearable filterable placeholder="未指定">
              <ElOption v-for="c in columns" :key="c" :label="c" :value="c" />
            </ElSelect>
          </div>

          <p v-if="guess" class="text-12 text-fg-faint">
            自动识别（置信度 {{ guess.confidence }}）：{{ guess.reason }}
            <span v-if="store.overrideCount > 0" class="text-[var(--c-signal)]">
              你改了 {{ store.overrideCount }} 处。
              <button class="underline" @click="store.resetOverrides()">还原</button>
            </span>
          </p>

          <p v-if="submitError" role="alert" class="text-13 text-[var(--c-alarm)]">{{ submitError }}</p>

          <ElButton type="primary" class="w-full" :disabled="!canIngest" :loading="submitting" @click="ingest">
            确认并入库
          </ElButton>
          <ElButton v-if="dataset.status === 'ingested'" class="w-full"
                    @click="router.push(`/p/${projectId}/model`)">
            下一步：配置模型
          </ElButton>
        </div>
      </template>
    </aside>

    <!-- 地图舞台 -->
    <section class="relative min-w-0 flex-1">
      <MapStage v-if="dataset" :layers="mapLayers" :fit="fit" />
      <div v-else class="grid h-full place-items-center p-8 text-center">
        <div>
          <p class="text-20">先上传一份数据</p>
          <p class="mt-2 text-fg-muted">上传后这里会立刻把点位打到地图上。<br />坐标系选错、经纬度写反在表格里看不出来，在地图上一秒就能看出来。</p>
        </div>
      </div>

      <div v-if="sentinel && dataset"
           class="absolute left-4 top-4 max-w-sm panel-mylar p-3"
           :class="sentinel.level === 'error' ? 'border border-[var(--c-alarm)]' : ''">
        <p class="text-eyebrow">落点检查</p>
        <p class="mt-1 text-13">{{ sentinel.message }}</p>
        <div v-if="sentinel.suggest" class="mt-2">
          <ElButton v-if="sentinel.suggest === 'swap'" size="small" @click="swapLngLat">交换经纬度列</ElButton>
          <ElButton v-else size="small" @click="store.overrides.sourceCrs = sentinel.suggest as SourceCRS">
            按 {{ sentinel.suggest }} 重新定位
          </ElButton>
        </div>
      </div>

      <div v-if="dataset" class="absolute bottom-4 left-4 right-4">
        <div class="panel-mylar">
          <button class="flex w-full items-center gap-2 px-3 py-2 text-13" @click="showTable = !showTable">
            <span>{{ showTable ? '▾' : '▸' }}</span>
            <span>前 {{ preview?.rows.length ?? 20 }} 行 · 共 {{ dataset.row_count.toLocaleString() }} 行</span>
            <span class="ml-auto text-fg-muted">{{ dataset.schema.length }} 个字段</span>
          </button>
          <div v-if="showTable" class="max-h-64 overflow-auto border-t border-edge p-3">
            <div v-if="previewPending"><ElSkeleton animated :rows="4" /></div>
            <FieldTable v-else :schema="dataset.schema" />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
