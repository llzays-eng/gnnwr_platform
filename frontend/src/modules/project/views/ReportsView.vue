<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import { isAppError, modelApi, reportApi, type ReportJob } from '@shared/api';
import { asId, METRIC_LABEL, type MetricKey, type ProjectId, type TaskId } from '@shared/types';
import { num, fmtDateTime, toEpoch } from '@shared/utils/format';

const route = useRoute();
const router = useRouter();
const projectId = computed(() => asId<ProjectId>(String(route.params['projectId'])));

const { data: tasks, isPending, error } = useQuery({
  queryKey: ['tasks', projectId.value],
  queryFn: () => modelApi.listTasks(projectId.value),
});

const done = computed(() => (tasks.value?.items ?? []).filter((t) => t.status === 'SUCCESS'));
const picked = ref<TaskId[]>([]);

/** 模型版本对比: 多任务指标并排 */
const results = useQuery({
  queryKey: computed(() => ['results', picked.value.join(',')]),
  queryFn: async () => Promise.all(picked.value.map(async (id) => ({ id, r: await modelApi.result(id) }))),
  enabled: computed(() => picked.value.length > 0),
});

const METRICS: MetricKey[] = ['r2', 'rmse', 'mae', 'aicc'];

/* 导出: 后端未说明同步还是异步(协商清单 #7)。
   前端按【异步】实现 —— 异步是更难的那种，按它写同步后端也能兼容，反之不行。 */
const job = ref<ReportJob | null>(null);
const exporting = ref(false);
const exportError = ref<string | null>(null);
let poll: number | null = null;

async function exportPdf(id: TaskId): Promise<void> {
  exporting.value = true; exportError.value = null; job.value = null;
  try {
    const res = await reportApi.export(id);
    if (res.kind === 'blob') {
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement('a');
      a.href = url; a.download = `gnnwr-report-${id}.pdf`; a.click();
      URL.revokeObjectURL(url);
      exporting.value = false;
      return;
    }
    job.value = res.job;
    if (poll) clearInterval(poll);
    poll = window.setInterval(async () => {
      try {
        const s = await reportApi.jobStatus(res.job.job_id);
        job.value = s;
        if (s.status === 'done' || s.status === 'failed') {
          clearInterval(poll!); poll = null; exporting.value = false;
        }
      } catch { clearInterval(poll!); poll = null; exporting.value = false; }
    }, 1500);
  } catch (e) {
    exportError.value = isAppError(e) ? e.message : '导出失败，请重试。';
    exporting.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-5xl p-6">
    <p class="text-eyebrow">阶段 5</p>
    <h2 class="mt-1 text-25">报告与版本对比</h2>

    <div v-if="isPending" class="mt-6"><ElSkeleton animated :rows="4" /></div>

    <div v-else-if="error && isAppError(error) && error.code === 'NOT_FOUND'"
         class="mt-6 rounded-sm border border-edge p-6">
      <p class="text-eyebrow">后端基线可能不匹配</p>
      <p class="mt-2">任务列表接口返回 404。请确认 API 指向 gnnwr_platform_backend（非 monorepo 旧 backend）。</p>
    </div>

    <div v-else-if="!done.length" class="mt-6 rounded-sm border border-edge p-8 text-center">
      <p class="text-20">还没有可用于出报告的结果</p>
      <p class="mt-2 text-fg-muted">完成一次训练后，就可以在这里对比不同版本并导出技术报告。</p>
      <ElButton class="mt-3" type="primary" @click="router.push(`/p/${projectId}/model`)">去配置模型</ElButton>
    </div>

    <template v-else>
      <p class="mt-4 text-eyebrow">选择要对比的任务</p>
      <div class="mt-2 space-y-1">
        <label v-for="t in done" :key="t.id" class="flex items-center gap-3 rounded-sm border border-edge px-3 py-2">
          <input type="checkbox" :value="t.id" v-model="picked" />
          <span class="num text-13">{{ t.id }}</span>
          <span class="text-eyebrow">{{ t.model_type }}</span>
          <span class="num text-12 text-fg-muted">Y = {{ t.y_column }}</span>
          <span class="num ml-auto text-12 text-fg-faint">{{ fmtDateTime(toEpoch(t.created_at)) }}</span>
          <ElButton size="small" :loading="exporting" @click.prevent="exportPdf(t.id)">导出 PDF</ElButton>
        </label>
      </div>

      <div v-if="job" class="mt-3 rounded-sm border border-edge p-3">
        <p class="text-13">
          报告生成中 · {{ Math.round(job.progress * 100) }}%
          <span v-if="job.status === 'done'" class="text-[var(--c-isoline)]">已完成</span>
        </p>
        <ElProgress :percentage="Math.round(job.progress * 100)" :stroke-width="4" class="mt-1" />
        <a v-if="job.download_url" :href="job.download_url" class="mt-2 inline-block text-13 underline">下载报告</a>
      </div>
      <p v-if="exportError" role="alert" class="mt-2 text-13 text-[var(--c-alarm)]">{{ exportError }}</p>

      <div v-if="results.data.value?.length" class="mt-6 overflow-auto">
        <p class="text-eyebrow">指标并排</p>
        <table class="mt-2 w-full text-13">
          <thead>
            <tr class="border-b border-edge text-left">
              <th class="py-1.5 font-normal text-fg-muted">任务</th>
              <th v-for="m in METRICS" :key="m" class="py-1.5 text-right font-normal text-fg-muted">{{ METRIC_LABEL[m] }}</th>
              <th class="py-1.5 text-right font-normal text-fg-muted">样本</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in results.data.value" :key="row.id" class="border-b border-edge last:border-0">
              <td class="num py-1.5">{{ row.id }}</td>
              <td v-for="m in METRICS" :key="m" class="num py-1.5 text-right">{{ num(row.r[m], 3) }}</td>
              <td class="num py-1.5 text-right">{{ row.r.sample_count.toLocaleString() }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
