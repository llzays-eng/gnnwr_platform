import { defineStore } from 'pinia'
import { authApi } from '@/api'

// 令牌持久化到 localStorage，刷新不丢登录态
export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('gp_token') || '',
    role: localStorage.getItem('gp_role') || 'guest',
    username: localStorage.getItem('gp_user') || '',
  }),
  actions: {
    async login(username: string, password: string) {
      const t = await authApi.login(username, password)
      this.token = t.access_token
      this.role = t.role
      this.username = username
      localStorage.setItem('gp_token', t.access_token)
      localStorage.setItem('gp_role', t.role)
      localStorage.setItem('gp_user', username)
    },
    logout() {
      this.token = ''
      this.role = 'guest'
      this.username = ''
      localStorage.removeItem('gp_token')
      localStorage.removeItem('gp_role')
      localStorage.removeItem('gp_user')
    },
  },
})
