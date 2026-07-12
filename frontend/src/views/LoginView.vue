<template>
  <div class="auth">
    <div class="panel">
      <div class="head">
        <svg width="34" height="34" viewBox="0 0 32 32" fill="none">
          <rect x="1" y="1" width="30" height="30" rx="8" fill="#141D28" stroke="#24323F"/>
          <circle cx="10" cy="12" r="2.4" fill="#4E93DE"/><circle cx="20" cy="10" r="2.4" fill="#8FBEEA"/>
          <circle cx="16" cy="19" r="2.4" fill="#EB7A54"/><circle cx="9" cy="22" r="2.4" fill="#34D1BE"/>
          <path d="M10 12 L20 10 M16 19 L10 12 M9 22 L16 19" stroke="#34D1BE" stroke-width="1" opacity=".55"/>
        </svg>
        <div>
          <h1>GNNWR 时空智能分析云平台</h1>
          <p class="mono">{{ mode === 'login' ? '登录以进入工作台' : '创建账号' }}</p>
        </div>
      </div>

      <el-form label-position="top" @submit.prevent>
        <el-form-item v-if="mode === 'register'" label="邮箱">
          <el-input v-model="email" placeholder="you@example.com" />
        </el-form-item>
        <el-form-item :label="mode === 'login' ? '邮箱' : '用户名'">
          <el-input v-model="username" :placeholder="mode === 'login' ? '邮箱' : '用户名'" @keyup.enter="submit" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="password" type="password" show-password placeholder="至少 6 位" @keyup.enter="submit" />
        </el-form-item>
        <el-button type="primary" style="width:100%" :loading="busy" @click="submit">
          {{ mode === 'login' ? '登录' : '注册并登录' }}
        </el-button>
      </el-form>

      <div class="switch">
        <span v-if="mode === 'login'">还没有账号？<a @click="mode = 'register'">注册</a></span>
        <span v-else>已有账号？<a @click="mode = 'login'">登录</a></span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { authApi } from '@/api'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const mode = ref<'login' | 'register'>('login')
const email = ref(''); const username = ref(''); const password = ref('')
const busy = ref(false)

async function submit() {
  if (!password.value) return ElMessage.warning('请填写密码')
  busy.value = true
  try {
    if (mode.value === 'register') {
      if (!email.value || !username.value) { busy.value = false; return ElMessage.warning('请填写邮箱和用户名') }
      await authApi.register(email.value, username.value, password.value)
      await auth.login(email.value, password.value)   // 用邮箱登录
    } else {
      if (!username.value) { busy.value = false; return ElMessage.warning('请填写邮箱') }
      await auth.login(username.value, password.value)  // 登录模式下这个框存的就是邮箱
    }
    router.push((route.query.redirect as string) || '/projects')
  } catch (e: any) {
    ElMessage.error(e.response?.data?.detail || '操作失败，请检查后端服务是否已启动')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.auth { min-height: 100%; display: grid; place-items: center; padding: 24px;
  background: radial-gradient(120% 90% at 50% -10%, #14202b 0%, var(--ink) 60%); }
.panel { width: 380px; max-width: 100%; background: var(--panel); border: 1px solid var(--line);
  border-radius: 16px; padding: 28px; }
.head { display: flex; gap: 13px; align-items: center; margin-bottom: 22px; }
.head h1 { font-size: 16px; margin: 0; font-weight: 640; }
.head p { margin: 3px 0 0; font-size: 11px; color: var(--faint); }
.switch { margin-top: 16px; font-size: 12.5px; color: var(--muted); text-align: center; }
.switch a { cursor: pointer; }
:deep(.el-form-item__label){ color: var(--muted); font-size: 12px; }
</style>
