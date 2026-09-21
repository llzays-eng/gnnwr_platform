<script setup lang="ts">
import { useRouter } from 'vue-router';
const router = useRouter();
</script>
<template>
  <main class="grid h-full place-items-center p-6">
    <div class="max-w-md text-center">
      <p class="text-eyebrow">404</p>
      <h1 class="mt-1 text-25">这个地址没有对应的页面</h1>
      <p class="mt-2 text-fg-muted">链接可能已过期, 或对象已被删除。</p>
      <ElButton class="mt-4" @click="router.push('/projects')">回到项目库</ElButton>
    </div>
  </main>
</template>
