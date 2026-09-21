<script setup lang="ts">
import { useRouter } from 'vue-router';
const router = useRouter();
</script>
<template>
  <main class="grid h-full place-items-center p-6">
    <div class="max-w-md text-center">
      <p class="text-eyebrow">403</p>
      <h1 class="mt-1 text-25">当前账号没有此页面的权限</h1>
      <p class="mt-2 text-fg-muted">这个页面需要更高的角色。可以联系项目管理员申请, 或换一个账号登录。</p>
      <ElButton class="mt-4" @click="router.push('/projects')">回到项目库</ElButton>
    </div>
  </main>
</template>
