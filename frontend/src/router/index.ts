import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/projects' },
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    { path: '/projects', name: 'projects', component: () => import('@/views/ProjectsView.vue') },
    { path: '/projects/:id/workspace', name: 'workspace', component: () => import('@/views/WorkspaceView.vue') },
  ],
})

// 全局守卫：未登录跳转 /login
router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.token) return { name: 'login', query: { redirect: to.fullPath } }
  if (to.name === 'login' && auth.token) return { name: 'projects' }
  return true
})

export default router
