<script setup lang="ts">
import type { TrainingHyperparams } from '@shared/types';
import { RECOMMENDED, TRAINING_META } from '../hyperparam-meta';

const tr = defineModel<TrainingHyperparams>({ required: true });

const applyRecommended = (): void => {
  tr.value.batch_size = RECOMMENDED.batch_size;
  tr.value.max_epochs = RECOMMENDED.max_epochs;
  tr.value.learning_rate = RECOMMENDED.learning_rate;
  tr.value.early_stopping_patience = RECOMMENDED.early_stopping_patience;
};
</script>

<template>
  <div class="space-y-5">
    <div class="flex justify-end">
      <ElButton size="small" @click="applyRecommended">用推荐配置填充</ElButton>
    </div>

    <div class="grid gap-5 sm:grid-cols-2">
      <div>
        <p class="text-eyebrow">{{ TRAINING_META.batch_size.label }}</p>
        <ElInputNumber v-model="tr.batch_size" class="mt-1" :min="8" :max="4096" :step="8" />
        <p class="mt-1 text-12 text-fg-muted">{{ TRAINING_META.batch_size.plain }} 推荐 {{ TRAINING_META.batch_size.recommended }}。</p>
      </div>
      <div>
        <p class="text-eyebrow">{{ TRAINING_META.max_epochs.label }}</p>
        <ElInputNumber v-model="tr.max_epochs" class="mt-1" :min="1" :max="5000" :step="50" />
        <p class="mt-1 text-12 text-fg-muted">{{ TRAINING_META.max_epochs.plain }} 推荐 {{ TRAINING_META.max_epochs.recommended }}。</p>
      </div>
      <div>
        <p class="text-eyebrow">{{ TRAINING_META.learning_rate.label }}</p>
        <ElInputNumber v-model="tr.learning_rate" class="mt-1" :min="0.00001" :max="1" :step="0.0005" :precision="5" />
        <p class="mt-1 text-12 text-fg-muted">{{ TRAINING_META.learning_rate.plain }} 推荐 {{ TRAINING_META.learning_rate.recommended }}。</p>
      </div>
      <div>
        <p class="text-eyebrow">{{ TRAINING_META.early_stopping_patience.label }}</p>
        <ElInputNumber v-model="tr.early_stopping_patience" class="mt-1" :min="1" :max="500" :step="5" />
        <p class="mt-1 text-12 text-fg-muted">{{ TRAINING_META.early_stopping_patience.plain }} 推荐 {{ TRAINING_META.early_stopping_patience.recommended }}。</p>
      </div>
    </div>
  </div>
</template>
