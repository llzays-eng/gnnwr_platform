<script setup lang="ts">
import type { Dataset, DatasetStatus } from '@shared/types';

const props = defineProps<{ dataset: Dataset }>();
defineEmits<{ retry: []; remap: [] }>();

/** 五态各自的界面语言。failed 必须给出可操作的下一步，这是硬要求。 */
const META: Record<DatasetStatus, { label: string; tone: string; hint: string }> = {
  uploaded: { label: '已上传', tone: 'text-fg-muted', hint: '确认坐标系与字段映射后即可入库。' },
  cleaning: { label: '清洗中', tone: 'text-[var(--c-ochre)]', hint: '正在做坐标转换与异常值处理，通常不超过一分钟。' },
  cleaned: { label: '已清洗', tone: 'text-[var(--c-isoline)]', hint: '数据已就绪，可以开始建模。' },
  ingested: { label: '已入库', tone: 'text-[var(--c-isoline)]', hint: '数据已入库，可以开始建模。' },
  failed: { label: '处理失败', tone: 'text-[var(--c-alarm)]', hint: '' },
};
const meta = () => META[props.dataset.status];
</script>

<template>
  <div class="rounded-sm border border-edge p-3">
    <div class="flex items-center gap-2">
      <span class="text-eyebrow">数据集状态</span>
      <span :class="meta().tone">{{ meta().label }}</span>
    </div>
    <p class="mt-1 text-13 text-fg-muted">
      {{ dataset.status_detail?.message ?? meta().hint }}
    </p>
    <div v-if="dataset.status === 'failed'" class="mt-2 flex flex-wrap gap-2">
      <template v-for="a in dataset.status_detail?.next_actions ?? []" :key="a.kind">
        <ElButton v-if="a.kind === 'change_crs'" size="small" @click="$emit('remap')">改用 {{ a.suggested }} 重试</ElButton>
        <ElButton v-else-if="a.kind === 'remap_columns'" size="small" @click="$emit('remap')">重新指定字段</ElButton>
        <ElButton v-else-if="a.kind === 'reupload'" size="small" @click="$emit('retry')">重新上传</ElButton>
        <ElButton v-else-if="a.kind === 'drop_invalid_rows'" size="small" @click="$emit('remap')">丢弃 {{ a.count }} 行异常并重试</ElButton>
        <span v-else class="text-13 text-fg-muted">请联系管理员</span>
      </template>
    </div>
  </div>
</template>
