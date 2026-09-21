<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import LossChart from '../components/LossChart.vue';
import BetaRibbon from '../components/BetaRibbon.vue';
import { useTaskSocket } from '../composables/useTaskSocket';
import { isAppError, modelApi } from '@shared/api';
import { asId, type SocketPhase, type TaskId } from '@shared/types';
import { duration } from '@shared/utils/format';

const route = useRoute();
const router = useRouter();
const taskId = computed(() => asId<TaskId>(String(route.params['taskId'])));
const projectId = computed(() => String(route.params['projectId']));

const { task, phase, coefSummary, coefSupported, logs } = useTaskSocket(taskId);
const showLogs = ref(false);
const cancelError = ref<string | null>(null);

/** 成功后才拉结果; 失败/运行中拉会得到 409 */
const { data: result } = useQuery({
  queryKey: computed(() => ['result', taskId.value]),
  queryFn: () => modelApi.result(taskId.value),
  enabled: computed(() => task.value?.status === 'SUCCESS'),
});

const PHASE_TEXT: Record<SocketPhase, string> = {
  idle: '未连接',
  connecting: '连接中',
  open: '实时连接',
  reconnecting: '连接中断，正在重连',
  closed: '连接已关闭',
  fallback_polling: '实时推送不可用，已切换为每 8 秒轮询',
};

const progress = computed(() => task.value?.progress);
const pct = computed(() => {
  const p = progress.value;
  return p ? Math.round((p.epoch / p.total_epochs) * 100) : 0;
});

async function cancel(): Promise<void> {
  cancelError.value = null;
  try { await modelApi.cancel(taskId.value); }
  catch (e) {
    cancelError.value = isAppError(e) && e.code === 'NOT_FOUND'
      ? '取消接口返回 404。请确认 API 指向 gnnwr_platform_backend（非 monorepo 旧 backend）。'
      : (isAppError(e) ? e.message : '取消失败，请重试。');
  }
}
</script>

<template>
  <div class="mx-auto max-w-5xl p-6">
    <div v-if="!task" class="mt-6"><ElSkeleton animated :rows="6" /></div>

    <template v-else>
      <div class="flex flex-wrap items-baseline gap-3">
        <p class="text-eyebrow">任务 {{ task.id }}</p>
        <span class="num text-13"
              :class="{ 'text-[var(--c-isoline)]': task.status === 'SUCCESS',
                        'text-[var(--c-alarm)]': task.status === 'FAILED' }">
          {{ { PENDING: '排队中', RUNNING: '训练中', SUCCESS: '已完成', FAILED: '失败' }[task.status] }}
        </span>
        <span class="text-12" :class="phase === 'open' ? 'text-[var(--c-isoline)]' : 'text-[var(--c-ochre)]'">
          ● {{ PHASE_TEXT[phase] }}
        </span>
        <div class="ml-auto flex gap-2">
          <ElButton size="small" @click="showLogs = !showLogs">查看日志</ElButton>
          <ElButton v-if="task.status === 'RUNNING' || task.status === 'PENDING'" size="small" @click="cancel">取消训练</ElButton>
          <ElButton v-if="task.status === 'SUCCESS'" size="small" type="primary"
                    @click="router.push(`/p/${projectId}/explore/${task.id}`)">
            查看解读看板
          </ElButton>
          <ElButton v-if="task.status === 'FAILED'" size="small" @click="router.push(`/p/${projectId}/model`)">
            调整配置重试
          </ElButton>
        </div>
      </div>

      <p v-if="cancelError" role="alert" class="mt-2 text-13 text-[var(--c-alarm)]">{{ cancelError }}</p>

      <div v-if="task.status === 'PENDING'" class="mt-4 rounded-sm border border-edge p-4">
        <p>任务已提交，正在等待算力节点。</p>
        <p class="mt-1 text-13 text-fg-muted">队列通常在一分钟内开始。这个页面会自动更新，可以关掉再回来。</p>
      </div>

      <div v-if="task.status === 'FAILED'" class="mt-4 rounded-sm border border-[var(--c-alarm)] p-4">
        <p class="text-[var(--c-alarm)]">{{ task.error?.message ?? '训练失败。' }}</p>
        <p class="mt-1 text-13 text-fg-muted">
          {{ task.error?.retryable ? '这是可重试的错误，用相同配置再跑一次通常能通过。' : '请检查字段映射与超参数配置后重新提交。' }}
        </p>
      </div>

      <div v-if="progress" class="mt-4">
        <ElProgress :percentage="pct" :stroke-width="6"
                    :status="task.status === 'SUCCESS' ? 'success' : undefined" />
        <div class="num mt-1 flex flex-wrap gap-4 text-12 text-fg-muted">
          <span>epoch {{ progress.epoch }} / {{ progress.total_epochs }}</span>
          <span>已用 {{ duration(progress.elapsed_s) }}</span>
          <span>预计剩余 {{ duration(progress.eta_s) }}</span>
        </div>
      </div>

      <div class="mt-6 grid gap-5 lg:grid-cols-2">
        <section>
          <p class="text-eyebrow">损失曲线</p>
          <LossChart class="mt-1" :history="result?.loss_history ?? []" />
        </section>

        <section>
          <p class="text-eyebrow">系数带演进</p>
          <!-- 目标用户读不懂 loss，但读得懂"地铁距离的影响正在南北分化" -->
          <div v-if="coefSupported && coefSummary" class="mt-2 space-y-3">
            <BetaRibbon v-for="c in coefSummary" :key="c.variable" :summary="c" size="card" />
            <p class="text-12 text-fg-faint">带在变宽 = 空间差异正在被学出来。</p>
          </div>
          <div v-else-if="task.status === 'RUNNING'" class="mt-2 rounded-sm border border-edge p-4 text-13 text-fg-muted">
            训练中，暂无系数摘要。<br />
            <span class="text-12 text-fg-faint">该视图依赖 WebSocket 推送 coef_summary 字段；若当前任务未推送，训练完成后仍可在解读看板查看完整系数分布。</span>
          </div>
          <div v-else-if="result" class="mt-2 space-y-3">
            <BetaRibbon v-for="c in result.coefficients_summary" :key="c.variable" :summary="c" size="card" />
          </div>
        </section>
      </div>

      <div v-if="showLogs" class="mt-6">
        <p class="text-eyebrow">训练日志</p>
        <div class="num mt-1 max-h-56 overflow-auto rounded-sm border border-edge bg-[var(--s-inset)] p-3 text-12">
          <p v-if="!logs.length" class="text-fg-muted">暂无日志。</p>
          <p v-for="(l, i) in logs" :key="i" :class="l.level === 'warn' ? 'text-[var(--c-ochre)]' : ''">
            {{ new Date(l.at).toLocaleTimeString() }} {{ l.message }}
          </p>
        </div>
      </div>
    </template>
  </div>
</template>
