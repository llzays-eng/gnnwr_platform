<template>
  <div class="shell">
    <header v-if="auth.token" class="topbar">
      <div class="brand" @click="router.push('/projects')">
        <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
          <rect x="1" y="1" width="30" height="30" rx="8" fill="#141D28" stroke="#24323F"/>
          <circle cx="10" cy="12" r="2.4" fill="#4E93DE"/><circle cx="20" cy="10" r="2.4" fill="#8FBEEA"/>
          <circle cx="16" cy="19" r="2.4" fill="#EB7A54"/><circle cx="9" cy="22" r="2.4" fill="#34D1BE"/>
          <path d="M10 12 L20 10 M16 19 L10 12 M9 22 L16 19" stroke="#34D1BE" stroke-width="1" opacity=".55"/>
        </svg>
        <span>GNNWR 时空智能分析</span>
      </div>
      <div class="spring"></div>
      <span class="who mono">{{ auth.username }} · {{ roleLabel }}</span>
      <el-button size="small" text @click="logout">退出</el-button>
    </header>
    <main class="body"><router-view /></main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const roleLabel = computed(
  () => ({ admin: '管理员', user: '普通用户', guest: '游客' } as Record<string, string>)[auth.role] || auth.role,
)
function logout() {
  auth.logout()
  router.push('/login')
}
</script>

<style scoped>
.shell { height: 100%; display: flex; flex-direction: column; }
.topbar { display: flex; align-items: center; gap: 12px; padding: 11px 20px;
  border-bottom: 1px solid var(--line-soft); background: rgba(14,20,27,.8); backdrop-filter: blur(8px); }
.brand { display: flex; align-items: center; gap: 9px; font-weight: 640; cursor: pointer; }
.spring { flex: 1; }
.who { font-size: 12px; color: var(--muted); }
.body { flex: 1; overflow: auto; }
</style>
