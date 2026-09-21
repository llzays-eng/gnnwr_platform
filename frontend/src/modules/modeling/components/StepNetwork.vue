<script setup lang="ts">
import type { NetworkStructure } from '@shared/types';
import { ACTIVATION_OPTIONS, NETWORK_META, RECOMMENDED } from '../hyperparam-meta';

const net = defineModel<NetworkStructure>({ required: true });

const addLayer = (): void => { net.value.hidden_layers.push(32); };
const removeLayer = (i: number): void => { net.value.hidden_layers.splice(i, 1); };
const applyRecommended = (): void => {
  net.value.hidden_layers = [...RECOMMENDED.hidden_layers];
  net.value.activation = RECOMMENDED.activation;
  net.value.dropout = RECOMMENDED.dropout;
};
</script>

<template>
  <div class="space-y-5">
    <div class="flex justify-end">
      <ElButton size="small" @click="applyRecommended">用推荐配置填充</ElButton>
    </div>

    <div>
      <p class="text-eyebrow">{{ NETWORK_META.hidden_layers.label }}</p>
      <p class="mt-1 text-12 text-fg-muted">{{ NETWORK_META.hidden_layers.plain }} 推荐 {{ NETWORK_META.hidden_layers.recommended }}。</p>

      <div class="mt-2 flex flex-wrap items-end gap-2">
        <div class="rounded-xs border border-edge px-3 py-2 text-center">
          <p class="text-11 text-fg-faint">输入</p>
          <p class="num text-13">坐标 + X</p>
        </div>
        <template v-for="(_, i) in net.hidden_layers" :key="i">
          <span class="pb-3 text-fg-faint">→</span>
          <div class="rounded-xs border border-edge px-2 py-1.5 text-center">
            <p class="text-11 text-fg-faint">第 {{ i + 1 }} 层</p>
            <ElInputNumber v-model="net.hidden_layers[i]" size="small" :min="1" :max="1024" :step="8"
                           controls-position="right" style="width: 92px" />
            <button class="mt-1 block w-full text-11 text-fg-muted underline" @click="removeLayer(i)">删除</button>
          </div>
        </template>
        <span class="pb-3 text-fg-faint">→</span>
        <button class="rounded-xs border border-dashed border-edge-strong px-3 py-3 text-13" @click="addLayer">+ 加一层</button>
      </div>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <div>
        <p class="text-eyebrow">{{ NETWORK_META.activation.label }}</p>
        <ElSelect v-model="net.activation" class="mt-1 w-full">
          <ElOption v-for="a in ACTIVATION_OPTIONS" :key="a.value" :label="a.label" :value="a.value">
            <span>{{ a.label }}</span>
            <span class="ml-2 text-12 text-fg-faint">{{ a.plain }}</span>
          </ElOption>
        </ElSelect>
        <p class="mt-1 text-12 text-fg-muted">{{ NETWORK_META.activation.plain }}</p>
      </div>
      <div>
        <p class="text-eyebrow">{{ NETWORK_META.dropout.label }} · {{ net.dropout }}</p>
        <ElSlider v-model="net.dropout" :min="0" :max="0.6" :step="0.05" class="mt-1" />
        <p class="mt-1 text-12 text-fg-muted">{{ NETWORK_META.dropout.plain }} 推荐 {{ NETWORK_META.dropout.recommended }}。</p>
      </div>
    </div>
  </div>
</template>
