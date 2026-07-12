import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

// 走 Vite 代理（/api -> FastAPI:8000）。生产由 Nginx 反代。
export const http = axios.create({ baseURL: '/api/v1', timeout: 30000 })

http.interceptors.request.use((cfg) => {
  const auth = useAuthStore()
  if (auth.token) cfg.headers.Authorization = `Bearer ${auth.token}`
  return cfg
})

http.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      const auth = useAuthStore()
      auth.logout()
      if (location.pathname !== '/login') location.href = '/login'
    }
    return Promise.reject(err)
  },
)

// WebSocket 地址（训练进度推送）——同源，走 Vite ws 代理
export function wsUrl(taskId: string): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/api/v1/models/tasks/${taskId}/ws`
}
