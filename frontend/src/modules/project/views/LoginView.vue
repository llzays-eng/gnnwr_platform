<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@stores/index';
import { isAppError } from '@shared/api';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const username = ref('demo');
const password = ref('demo');
const error = ref<string | null>(null);
const actions = ref<readonly string[]>([]);

async function submit(): Promise<void> {
  error.value = null;
  try {
    await auth.login({ username: username.value, password: password.value });
    const redirect = route.query['redirect'];
    await router.replace(typeof redirect === 'string' ? redirect : '/projects');
  } catch (e) {
    // 错误不道歉、不含糊: 说明发生了什么 + 怎么修复
    if (isAppError(e)) { error.value = e.message; actions.value = e.actions; }
    else { error.value = '登录失败, 请重试。'; actions.value = []; }
  }
}
</script>

<template>
  <main class="grid h-full place-items-center bg-[var(--s-page)] p-6">
    <div class="w-full max-w-sm">
      <p class="text-eyebrow">GNNWR · 时空智能分析平台</p>
      <h1 class="mt-2 text-32 leading-tight">登录</h1>
      <p class="mt-2 text-fg-muted">演示环境可用 demo / demo 登录, 或直接以游客身份浏览演示项目。</p>

      <div class="mt-6 space-y-3">
        <ElInput v-model="username" placeholder="用户名" size="large" @keyup.enter="submit" />
        <ElInput v-model="password" type="password" placeholder="密码" size="large" show-password @keyup.enter="submit" />

        <div v-if="error" role="alert" class="rounded-sm border border-[var(--c-alarm)] p-3">
          <p class="text-[var(--c-alarm)]">{{ error }}</p>
          <ul v-if="actions.length" class="mt-1 text-fg-muted">
            <li v-for="a in actions" :key="a">— {{ a }}</li>
          </ul>
        </div>

        <ElButton type="primary" size="large" class="w-full" :loading="auth.pending" @click="submit">
          登录
        </ElButton>
        <ElButton text class="w-full" @click="router.push('/projects')">以游客身份浏览</ElButton>
      </div>
    </div>
  </main>
</template>
