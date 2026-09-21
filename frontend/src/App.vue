<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useTaskStore, useUiStore } from '@stores/index';

// 触发主题的 watchEffect, 让 data-theme 与令牌层同步
useUiStore();

const tasks = useTaskStore();
let disposeCrossTab: (() => void) | null = null;

onMounted(() => {
  // 多标签页选主: 只有一个标签持有 WebSocket, 其余订阅广播。
  // 不这么做, 开 5 个标签就是 5 条连接。
  disposeCrossTab = tasks.initCrossTab();
});

onUnmounted(() => { disposeCrossTab?.(); });
</script>

<template>
  <RouterView v-slot="{ Component }">
    <Suspense>
      <component :is="Component" />
      <template #fallback>
        <div class="grid h-full place-items-center text-fg-muted">载入中</div>
      </template>
    </Suspense>
  </RouterView>
</template>
