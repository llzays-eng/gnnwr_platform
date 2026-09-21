<script setup lang="ts">
import type { Issue } from '../validation';

defineProps<{ issues: Issue[]; step?: number }>();
defineEmits<{ goto: [number] }>();
</script>

<template>
  <div class="space-y-2">
    <template v-for="(i, k) in issues" :key="k">
      <div v-if="!step || i.step === step" class="rounded-sm border p-2.5"
           :class="i.severity === 'error' ? 'border-[var(--c-alarm)]' : 'border-[var(--c-ochre)]'">
        <p class="text-13" :class="i.severity === 'error' ? 'text-[var(--c-alarm)]' : 'text-[var(--c-ochre)]'">
          {{ i.message }}
        </p>
        <ul class="mt-1 text-12 text-fg-muted">
          <li v-for="f in i.fixes" :key="f">— {{ f }}</li>
        </ul>
        <button v-if="!step" class="mt-1 text-12 underline text-fg-muted" @click="$emit('goto', i.step)">
          去步骤 {{ i.step }} 修改
        </button>
      </div>
    </template>
  </div>
</template>
