<script setup lang="ts">
import { ref } from 'vue';
import { ACCEPT, precheck } from '../composables/useUpload';
import { bytes } from '@shared/utils/format';

const emit = defineEmits<{ pick: [File] }>();
defineProps<{ progress: number; phase: string; message: string }>();

const over = ref(false);
const input = ref<HTMLInputElement | null>(null);
const reject = ref<string | null>(null);

function take(files: FileList | null): void {
  const f = files?.[0];
  if (!f) return;
  const chk = precheck(f);
  if (!chk.ok) { reject.value = `${chk.reason}。${chk.fix}`; return; }
  reject.value = null;
  emit('pick', f);
}
</script>

<template>
  <div>
    <div
      class="rounded-sm border border-dashed p-6 text-center transition-colors"
      :class="over ? 'border-[var(--c-signal)] bg-[var(--s-inset)]' : 'border-edge-strong'"
      role="button" tabindex="0"
      @dragover.prevent="over = true" @dragleave="over = false"
      @drop.prevent="over = false; take($event.dataTransfer?.files ?? null)"
      @click="input?.click()" @keyup.enter="input?.click()"
    >
      <p class="text-16">把数据文件拖到这里</p>
      <p class="mt-1 text-13 text-fg-muted">或点击选择 · 支持 {{ ACCEPT.join(' ') }}</p>
      <p class="mt-1 text-12 text-fg-faint">Shapefile 请打包为 .zip；超过 {{ bytes(200 * 1024 * 1024) }} 自动分片上传</p>
      <input ref="input" type="file" class="hidden" :accept="ACCEPT.join(',')" @change="take(($event.target as HTMLInputElement).files)" />
    </div>

    <p v-if="reject" role="alert" class="mt-2 text-13 text-[var(--c-alarm)]">{{ reject }}</p>

    <div v-if="phase === 'uploading'" class="mt-3">
      <ElProgress :percentage="Math.round(progress * 100)" :stroke-width="6" />
      <p class="mt-1 text-12 text-fg-muted">{{ message }} · {{ Math.round(progress * 100) }}%</p>
    </div>
    <p v-else-if="phase === 'error'" role="alert" class="mt-3 text-13 text-[var(--c-alarm)]">{{ message }}</p>
  </div>
</template>
