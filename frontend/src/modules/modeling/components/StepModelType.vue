<script setup lang="ts">
import { MODEL_TYPE_META, type ModelType } from '@shared/types';
const model = defineModel<ModelType | null>({ required: true });
</script>

<template>
  <div class="grid gap-3 md:grid-cols-2">
    <button v-for="(m, k) in MODEL_TYPE_META" :key="k"
            class="rounded-sm border p-4 text-left transition-colors"
            :class="model === k ? 'border-[var(--c-signal)]' : 'border-edge hover:border-edge-strong'"
            @click="model = k as ModelType">
      <p class="text-16">{{ m.label }}</p>
      <p class="mt-2 text-13 text-fg-muted leading-relaxed">{{ m.oneLiner }}</p>
      <p class="mt-2 text-12 text-fg-faint">{{ m.requiresTemporal ? '需要一个时间列' : '不需要时间列' }}</p>
    </button>
  </div>
</template>
