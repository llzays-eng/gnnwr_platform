<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import { projectApi, modelApi, isAppError } from '@shared/api';
import { asId, SCENARIO_LABEL, type ProjectId } from '@shared/types';
import { useUiStore } from '@stores/index';

const props = defineProps<{ projectId: string }>();
const route = useRoute();
const router = useRouter();
const ui = useUiStore();

const { data: project, error } = useQuery({
  queryKey: ['project', props.projectId],
  queryFn: () => projectApi.detail(asId<ProjectId>(props.projectId)),
});

/**
 * 阶段轨。
 *
 * 这不是功能菜单, 是流水线。用户需要它回答的是
 * 「我在第几步、下一步能不能走、卡在哪」——
 * 功能树(数据管理/模型管理/可视化/设置)一个都答不了。
 * 也因此没有面包屑: 5 个节点自带位置与前置关系, 面包屑是纯冗余。
 *
 * 解锁条件在阶段 2 接入真实状态(数据未入库 → ②锁, 无成功任务 → ④锁)。
 */
/* 让「解读」直接进最近一次成功任务的看板。
   不这么做的话，点第 4 步只能到任务列表再点一次 —— 多一次点击换不来任何信息。 */
const { data: tasks } = useQuery({
  queryKey: ['tasks', props.projectId],
  queryFn: () => modelApi.listTasks(asId<ProjectId>(props.projectId)),
  retry: false,
});
const latestSuccess = computed(() =>
  (tasks.value?.items ?? []).filter((t) => t.status === 'SUCCESS').at(-1) ?? null);

const STAGES = [
  { n: 1, key: 'data', label: '数据', path: 'data', lockHint: '' },
  { n: 2, key: 'model', label: '建模', path: 'model', lockHint: '先完成数据入库' },
  { n: 3, key: 'runs', label: '训练', path: 'runs', lockHint: '先提交一次建模任务' },
  { n: 4, key: 'explore', label: '解读', path: '', lockHint: '先等待一次训练成功' },
  { n: 5, key: 'reports', label: '报告', path: 'reports', lockHint: '先产出一次可用结果' },
] as const;

const currentStage = computed(() => route.meta.stage ?? 1);

function go(stage: (typeof STAGES)[number]): void {
  const path = stage.key === 'explore'
    ? (latestSuccess.value ? `explore/${latestSuccess.value.id}` : 'runs')
    : stage.path;
  void router.push(`/p/${props.projectId}/${path}`);
}
</script>

<template>
  <div class="flex h-full flex-col bg-[var(--s-page)]">
    <!-- 顶栏 48px。项目名 + 场景标识 + 主题 + 用户, 没有别的。 -->
    <header class="flex h-12 shrink-0 items-center gap-3 border-b border-edge px-4">
      <RouterLink to="/projects" class="font-display tracking-[0.14em] text-fg">GNNWR</RouterLink>
      <span class="text-edge-strong">/</span>
      <span class="truncate">{{ project?.name ?? '载入中' }}</span>
      <span v-if="project" class="text-eyebrow">{{ SCENARIO_LABEL[project.scenario_type] }}</span>
      <div class="ml-auto flex items-center gap-2">
        <ElButton text size="small" @click="ui.mode = ui.resolved === 'dark' ? 'light' : 'dark'">
          {{ ui.resolved === 'dark' ? '浅色' : '深色' }}
        </ElButton>
      </div>
    </header>

    <div class="flex min-h-0 flex-1">
      <!-- 阶段轨 56px -->
      <nav class="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-edge py-3" aria-label="分析阶段">
        <button
          v-for="s in STAGES"
          :key="s.key"
          class="flex w-full flex-col items-center gap-0.5 rounded-sm py-2 transition-colors"
          :class="currentStage === s.n ? 'bg-[var(--s-inset)] text-fg' : 'text-fg-muted hover:text-fg'"
          :aria-current="currentStage === s.n ? 'step' : undefined"
          :title="s.n === 4 && !latestSuccess ? s.lockHint : ''"
          @click="go(s)"
        >
          <span class="num text-11">{{ s.n }}</span>
          <span class="text-12">{{ s.label }}</span>
          <span
            class="mt-0.5 h-1.5 w-1.5 rounded-full"
            :class="currentStage === s.n ? 'bg-[var(--c-signal)]'
              : currentStage > s.n ? 'bg-[var(--c-isoline)]' : 'bg-[var(--edge-strong)]'"
          />
        </button>
      </nav>

      <!-- 阶段内容区: 全宽, 允许地图占满。绝不做四宫格挤压地图。 -->
      <main class="min-w-0 flex-1 overflow-auto">
        <div v-if="error && isAppError(error) && error.code === 'NOT_FOUND'"
             class="border-b border-edge bg-[var(--s-raised)] px-4 py-2 text-12 text-fg-muted">
          项目详情返回 404。请确认 API 指向 gnnwr_platform_backend（非 monorepo 旧 backend）。
        </div>
        <RouterView />
      </main>
    </div>
  </div>
</template>
