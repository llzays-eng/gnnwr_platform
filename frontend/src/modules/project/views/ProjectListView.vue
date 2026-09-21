<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { useRouter } from 'vue-router';
import { projectApi, isAppError } from '@shared/api';
import { SCENARIO_LABEL } from '@shared/types';
import { useAuthStore } from '@stores/index';
import { fmtDate, toEpoch } from '@shared/utils/format';
import CreateProjectDialog from '../components/CreateProjectDialog.vue';
import { ref } from 'vue';

const router = useRouter();
const auth = useAuthStore();

const { data, isPending, error } = useQuery({
  queryKey: ['projects'],
  queryFn: () => projectApi.list(),
});

const backendMismatch = (e: unknown) => isAppError(e) && e.code === 'NOT_FOUND';
const showCreate = ref(false);
</script>

<template>
  <main class="mx-auto max-w-5xl p-6">
    <header class="flex items-end justify-between">
      <div>
        <p class="text-eyebrow">项目库</p>
        <h1 class="mt-1 text-32">分析项目</h1>
      </div>
      <ElButton v-if="auth.can('user')" type="primary" @click="showCreate = true">新建项目</ElButton>
      <ElButton v-else disabled title="登录后可用">新建项目</ElButton>
    </header>

    <!-- loading -->
    <div v-if="isPending" class="mt-8 space-y-3">
      <ElSkeleton v-for="i in 3" :key="i" animated :rows="2" />
    </div>

    <!-- 404 更可能是连到了旧后端，给出明确排查方向 -->
    <div v-else-if="backendMismatch(error)" class="mt-8 rounded-sm border border-edge p-6">
      <p class="text-eyebrow">后端基线可能不匹配</p>
      <p class="mt-2">项目列表接口返回 404。请确认 API 指向 <code>gnnwr_platform_backend</code>（非 monorepo 旧 backend）。</p>
    </div>

    <!-- 其他错误 -->
    <div v-else-if="error" role="alert" class="mt-8 rounded-sm border border-[var(--c-alarm)] p-6">
      <p class="text-[var(--c-alarm)]">{{ isAppError(error) ? error.message : '加载失败。' }}</p>
    </div>

    <!-- 空态是行动邀请, 不是情绪装饰 -->
    <div v-else-if="!data?.items.length" class="mt-8 rounded-sm border border-edge p-8 text-center">
      <p class="text-20">还没有分析项目</p>
      <p class="mt-2 text-fg-muted">新建一个项目, 上传数据后即可开始建模。</p>
      <ElButton type="primary" class="mt-4" @click="showCreate = true">新建项目</ElButton>
    </div>

    <ul v-else class="mt-8 grid gap-3 md:grid-cols-2">
      <li
        v-for="p in data.items"
        :key="p.id"
        class="cursor-pointer rounded-sm border border-edge bg-[var(--s-surface)] p-4 transition-shadow hover:shadow-e1"
        tabindex="0"
        @click="router.push(`/p/${p.id}/data`)"
        @keyup.enter="router.push(`/p/${p.id}/data`)"
      >
        <div class="flex items-center gap-2">
          <span class="text-eyebrow">{{ SCENARIO_LABEL[p.scenario_type] }}</span>
          <span v-if="p.is_demo" class="text-eyebrow text-[var(--c-isoline)]">演示</span>
        </div>
        <h2 class="mt-1 text-20">{{ p.name }}</h2>
        <p class="mt-1 line-clamp-2 text-fg-muted">{{ p.description }}</p>
        <p class="num mt-3 text-12 text-fg-faint">更新于 {{ fmtDate(toEpoch(p.updated_at)) }}</p>
      </li>
    </ul>

    <CreateProjectDialog v-model="showCreate" @created="router.push(`/p/${$event.id}/data`)" />
  </main>
</template>
