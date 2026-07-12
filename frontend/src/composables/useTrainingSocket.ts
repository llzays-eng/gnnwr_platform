import { ref, onUnmounted } from 'vue'
import { wsUrl } from '@/api/client'
import { modelApi } from '@/api'

export interface EpochRec { epoch: number; train_loss: number; val_loss: number }

/**
 * 训练进度双通道：WebSocket 主推 + REST 轮询兜底（对齐大纲 7.3）。
 * WS 消息约定：{type:'epoch', epoch, train_loss, val_loss} / {type:'done'} / {type:'error', error}
 */
export function useTrainingSocket() {
  const connected = ref(false)
  const progress = ref(0)
  const status = ref<'idle' | 'running' | 'success' | 'failed'>('idle')
  const history = ref<EpochRec[]>([])
  const error = ref<string | null>(null)

  let ws: WebSocket | null = null
  let poll: number | null = null

  function start(taskId: string, onDone: () => void) {
    reset()
    status.value = 'running'
    // 主通道 WebSocket
    try {
      ws = new WebSocket(wsUrl(taskId))
      ws.onopen = () => (connected.value = true)
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data)
        if (m.type === 'epoch') {
          history.value.push({ epoch: m.epoch, train_loss: m.train_loss, val_loss: m.val_loss })
          if (m.progress != null) progress.value = m.progress
        } else if (m.type === 'done') {
          status.value = 'success'; progress.value = 1; cleanup(); onDone()
        } else if (m.type === 'error') {
          status.value = 'failed'; error.value = m.error; cleanup()
        }
      }
      ws.onerror = () => (connected.value = false)
      ws.onclose = () => (connected.value = false)
    } catch {
      connected.value = false
    }
    // 兜底轮询：WS 断开或不可用时仍能推进
    poll = window.setInterval(async () => {
      if (connected.value) return
      try {
        const s = await modelApi.status(taskId)
        progress.value = s.progress
        if (s.status === 'SUCCESS') { status.value = 'success'; cleanup(); onDone() }
        else if (s.status === 'FAILED') { status.value = 'failed'; error.value = s.error; cleanup() }
      } catch { /* 忽略瞬时错误 */ }
    }, 2000)
  }

  function reset() {
    history.value = []; progress.value = 0; error.value = null; status.value = 'idle'
  }
  function cleanup() {
    if (ws) { ws.close(); ws = null }
    if (poll) { clearInterval(poll); poll = null }
  }
  onUnmounted(cleanup)

  return { connected, progress, status, history, error, start, cleanup }
}
