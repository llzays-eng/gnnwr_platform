<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import StepModelType from '../components/StepModelType.vue';
import StepFieldMapping from '../components/StepFieldMapping.vue';
import StepSplit from '../components/StepSplit.vue';
import StepNetwork from '../components/StepNetwork.vue';
import StepTraining from '../components/StepTraining.vue';
import StepConfirm from '../components/StepConfirm.vue';
import IssueList from '../components/IssueList.vue';
import { canSubmit, stepBlocked, validate } from '../validation';
import { datasetApi, isAppError, modelApi } from '@shared/api';
import { asId, type DatasetId, type ProjectId, type TrainRequest } from '@shared/types';
import { useModelingStore } from '@stores/index';

const route = useRoute();
const router = useRouter();
const projectId = computed(() => asId<ProjectId>(String(route.params['projectId'])));
const store = useModelingStore();
store.bindProject(projectId.value);

const { data: list, isPending } = useQuery({
  queryKey: ['datasets', projectId.value],
  queryFn: () => datasetApi.list(projectId.value),
});

const datasetId = ref<DatasetId | null>(null);
watch(list, (v) => {
  const ready = v?.items.filter((d) => d.status === 'ingested') ?? [];
  if (!datasetId.value && ready.length) datasetId.value = ready[0]!.id;
}, { immediate: true });

const dataset = computed(() => list.value?.items.find((d) => d.id === datasetId.value) ?? null);
const schema = computed(() => dataset.value?.schema ?? []);

/** 规则引擎是纯函数, 这里只是把它接到响应式上 */
const issues = computed(() => validate(store.draft, schema.value));
const badFields = computed(() =>
  new Set(issues.value.filter((i) => i.severity === 'error' && i.field).map((i) => i.field!)));

const STEPS = ['模型类型', '字段映射', '数据划分', '网络结构', '训练超参', '确认提交'];
const submitting = ref(false);
const submitError = ref<string | null>(null);

async function submit(): Promise<void> {
  const d = store.draft;
  const ds = dataset.value;
  if (!ds || !d.model_type || !d.y_column || !d.longitude_column || !d.latitude_column) return;
  submitting.value = true;
  submitError.value = null;
  try {
    const body: TrainRequest = {
      project_id: projectId.value,
      dataset_id: ds.id,
      model_type: d.model_type,
      y_column: d.y_column,
      x_columns: [...d.x_columns],
      spatial_columns: [d.longitude_column, d.latitude_column],
      temporal_column: d.temporal_column,
      hyperparams: {
        ...d.network, ...d.training,
        split: d.split, random_seed: d.random_seed,
      },
    };
    const task = await modelApi.train(body);
    await router.push(`/p/${projectId.value}/runs/${task.id}`);
  } catch (e) {
    submitError.value = isAppError(e) ? e.message : '提交失败，请重试。';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-5xl p-6">
    <p class="text-eyebrow">阶段 2</p>
    <h2 class="mt-1 text-25">建模向导</h2>

    <div v-if="isPending" class="mt-6"><ElSkeleton animated :rows="5" /></div>

    <div v-else-if="!dataset" class="mt-6 rounded-sm border border-edge p-6 text-center">
      <p class="text-16">还没有已入库的数据集</p>
      <p class="mt-2 text-fg-muted">建模需要先完成数据接入。</p>
      <ElButton class="mt-3" type="primary" @click="router.push(`/p/${projectId}/data`)">去上传数据</ElButton>
    </div>

    <template v-else>
      <div class="mt-3 flex items-center gap-3">
        <ElSelect v-model="datasetId" size="small" style="width: 260px">
          <ElOption v-for="d in list?.items.filter((x) => x.status === 'ingested')" :key="d.id"
                    :label="d.filename" :value="d.id" />
        </ElSelect>
        <span class="num text-12 text-fg-muted">{{ dataset.row_count.toLocaleString() }} 行 · {{ dataset.schema.length }} 字段</span>
        <ElSelect v-if="store.templates.length" size="small" style="width: 200px" placeholder="套用配置模板"
                  @change="store.applyTemplate($event as string)">
          <ElOption v-for="t in store.templates" :key="t.id" :label="t.name" :value="t.id" />
        </ElSelect>
      </div>

      <ElSteps :active="store.step - 1" class="mt-5" align-center finish-status="success">
        <ElStep v-for="(s, i) in STEPS" :key="s" :title="s"
                :status="stepBlocked(issues, i + 1) ? 'error' : undefined"
                @click="store.step = i + 1" />
      </ElSteps>

      <div class="mt-6 min-h-72">
        <StepModelType v-if="store.step === 1" v-model="store.draft.model_type" />
        <StepFieldMapping v-else-if="store.step === 2" v-model="store.draft" :schema="schema" :bad-fields="badFields" />
        <StepSplit v-else-if="store.step === 3" :row-count="dataset.row_count" />
        <StepNetwork v-else-if="store.step === 4" v-model="store.draft.network" />
        <StepTraining v-else-if="store.step === 5" v-model="store.draft.training" />
        <StepConfirm v-else :draft="store.draft" :row-count="dataset.row_count" />
      </div>

      <div class="mt-4">
        <IssueList :issues="issues" :step="store.step === 6 ? undefined : store.step" @goto="store.step = $event" />
      </div>

      <p v-if="submitError" role="alert" class="mt-3 text-13 text-[var(--c-alarm)]">{{ submitError }}</p>

      <div class="mt-6 flex items-center gap-2 border-t border-edge pt-4">
        <ElButton :disabled="store.step === 1" @click="store.step--">上一步</ElButton>
        <span class="text-12 text-fg-faint">配置随时自动保存，回退不会丢失。</span>
        <div class="ml-auto flex gap-2">
          <ElButton text @click="store.reset()">重置配置</ElButton>
          <ElButton v-if="store.step < 6" type="primary" @click="store.step++">
            下一步：{{ STEPS[store.step] }}
          </ElButton>
          <ElButton v-else type="primary" :disabled="!canSubmit(issues)" :loading="submitting" @click="submit">
            开始训练
          </ElButton>
        </div>
      </div>
    </template>
  </div>
</template>
