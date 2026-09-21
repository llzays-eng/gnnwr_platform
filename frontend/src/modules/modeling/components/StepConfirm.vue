<script setup lang="ts">
import { ref } from 'vue';
import type { WizardDraft } from '@shared/types';
import { MODEL_TYPE_META } from '@shared/types';
import { useModelingStore } from '@stores/index';

defineProps<{ draft: WizardDraft; rowCount: number }>();
const store = useModelingStore();
const name = ref('');
const saved = ref(false);

function save(): void {
  if (!name.value.trim()) return;
  store.saveTemplate(name.value.trim());
  saved.value = true;
  name.value = '';
}
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-3 md:grid-cols-2">
      <div class="rounded-sm border border-edge p-3">
        <p class="text-eyebrow">模型与字段</p>
        <dl class="mt-2 space-y-1 text-13">
          <div class="flex gap-2"><dt class="w-20 text-fg-muted">模型</dt><dd>{{ draft.model_type ? MODEL_TYPE_META[draft.model_type].label : '—' }}</dd></div>
          <div class="flex gap-2"><dt class="w-20 text-fg-muted">目标 Y</dt><dd class="num">{{ draft.y_column ?? '—' }}</dd></div>
          <div class="flex gap-2"><dt class="w-20 shrink-0 text-fg-muted">自变量 X</dt><dd class="num">{{ draft.x_columns.join('、') || '—' }}</dd></div>
          <div class="flex gap-2"><dt class="w-20 text-fg-muted">坐标</dt><dd class="num">{{ draft.longitude_column }} / {{ draft.latitude_column }}</dd></div>
          <div class="flex gap-2"><dt class="w-20 text-fg-muted">时间</dt><dd class="num">{{ draft.temporal_column ?? '不使用' }}</dd></div>
        </dl>
      </div>

      <div class="rounded-sm border border-edge p-3">
        <p class="text-eyebrow">划分与网络</p>
        <dl class="mt-2 space-y-1 text-13">
          <div class="flex gap-2"><dt class="w-20 text-fg-muted">划分</dt><dd class="num">{{ Math.round(draft.split.train * 100) }} / {{ Math.round(draft.split.val * 100) }} / {{ Math.round(draft.split.test * 100) }}</dd></div>
          <div class="flex gap-2"><dt class="w-20 text-fg-muted">样本</dt><dd class="num">{{ rowCount.toLocaleString() }} 条</dd></div>
          <div class="flex gap-2"><dt class="w-20 text-fg-muted">隐藏层</dt><dd class="num">{{ draft.network.hidden_layers.join(' / ') }}</dd></div>
          <div class="flex gap-2"><dt class="w-20 text-fg-muted">激活</dt><dd class="num">{{ draft.network.activation }} · dropout {{ draft.network.dropout }}</dd></div>
          <div class="flex gap-2"><dt class="w-20 text-fg-muted">训练</dt><dd class="num">bs {{ draft.training.batch_size }} · lr {{ draft.training.learning_rate }} · 最多 {{ draft.training.max_epochs }} 轮</dd></div>
        </dl>
      </div>
    </div>

    <div class="rounded-sm border border-edge p-3">
      <p class="text-eyebrow">另存为配置模板</p>
      <p class="mt-1 text-12 text-fg-muted">
        只保存与数据集无关的部分（划分比例、网络结构、训练超参），换数据集也能复用。
        后端尚未提供模板接口（协商清单 #6），当前保存在本机浏览器，<span class="text-[var(--c-ochre)]">仅本机可见</span>。
      </p>
      <div class="mt-2 flex gap-2">
        <ElInput v-model="name" size="small" placeholder="例如：站点级时空反演 · 标准配置" />
        <ElButton size="small" :disabled="!name.trim()" @click="save">保存</ElButton>
      </div>
      <p v-if="saved" class="mt-1 text-12 text-[var(--c-isoline)]">模板已保存。</p>
    </div>
  </div>
</template>
