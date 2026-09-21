<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import { isAppError, modelApi } from '@shared/api';
import { asId, type ProjectId, type TaskStatus } from '@shared/types';
import { fmtDateTime, toEpoch } from '@shared/utils/format';

const route = useRoute();
const router = useRouter();
const projectId = computed(() => asId<ProjectId>(String(route.params['projectId'])));
const filter = ref<TaskStatus | 'ALL'>('ALL');

const { data, isPending, error } = useQuery({
  queryKey: ['tasks', projectId.value],
  queryFn: () => modelApi.listTasks(projectId.value),
  refetchInterval: 5000,
});

const LABEL: Record<TaskStatus, string> = { PENDING: '排队中', RUNNING: '训练中', SUCCESS: '已完成', FAILED: '失败' };
const rows = computed(() =>
  (data.value?.items ?? [])
    .filter((t) => filter.value === 'ALL' || t.status === filter.value)
    .sort((a, b) => toEpoch(b.created_at) - toEpoch(a.created_at)));
</script>

<template>
  <div class="mx-auto max-w-5xl p-6">
    <div class="flex items-end justify-between">
      <div>
        <p class="text-eyebrow">阶段 3</p>
        <h2 class="mt-1 text-25">训练任务</h2>
      </div>
      <ElRadioGroup v-model="filter" size="small">
        <ElRadioButton label="ALL">全部</ElRadioButton>
        <ElRadioButton v-for="(l, k) in LABEL" :key="k" :label="k">{{ l }}</ElRadioButton>
      </ElRadioGroup>
    </div>

    <div v-if="isPending" class="mt-6"><ElSkeleton animated :rows="4" /></div>

    <div v-else-if="error && isAppError(error) && error.code === 'NOT_FOUND'"
         class="mt-6 rounded-sm border border-edge p-6">
      <p class="text-eyebrow">后端基线可能不匹配</p>
      <p class="mt-2">任务列表接口返回 404。请确认 API 指向 gnnwr_platform_backend（非 monorepo 旧 backend）。</p>
    </div>

    <div v-else-if="!rows.length" class="mt-6 rounded-sm border border-edge p-8 text-center">
      <p class="text-20">还没有训练任务</p>
      <p class="mt-2 text-fg-muted">配置好模型后提交，任务会出现在这里。</p>
      <ElButton class="mt-3" type="primary" @click="router.push(`/p/${projectId}/model`)">去配置模型</ElButton>
    </div>

    <ul v-else class="mt-6 space-y-2">
      <li v-for="t in rows" :key="t.id"
          class="cursor-pointer rounded-sm border border-edge p-3 hover:border-edge-strong"
          tabindex="0"
          @click="router.push(`/p/${projectId}/runs/${t.id}`)"
          @keyup.enter="router.push(`/p/${projectId}/runs/${t.id}`)">
        <div class="flex flex-wrap items-center gap-3">
          <span class="num text-13">{{ t.id }}</span>
          <span class="text-eyebrow">{{ t.model_type }}</span>
          <span class="text-12"
                :class="{ 'text-[var(--c-isoline)]': t.status === 'SUCCESS', 'text-[var(--c-alarm)]': t.status === 'FAILED' }">
            {{ LABEL[t.status] }}
          </span>
          <span v-if="t.progress" class="num text-12 text-fg-muted">
            {{ t.progress.epoch }} / {{ t.progress.total_epochs }}
          </span>
          <span class="num ml-auto text-12 text-fg-faint">{{ fmtDateTime(toEpoch(t.created_at)) }}</span>
        </div>
        <p class="num mt-1 text-12 text-fg-muted">
          Y = {{ t.y_column }} · X = {{ t.x_columns.join('、') }}
        </p>
      </li>
    </ul>
  </div>
</template>
