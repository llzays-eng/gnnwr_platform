<template>
  <div class="mon">
    <div class="gp-card main">
      <div class="hd">
        <h3>训练监控</h3>
        <span class="chan mono" :class="{ ws: connected }">
          {{ connected ? '● WebSocket 实时推送' : '○ 轮询兜底通道' }}
        </span>
      </div>

      <div class="stats">
        <div class="s"><div class="v mono">{{ curEpoch }}</div><div class="k">当前 Epoch</div></div>
        <div class="s"><div class="v mono">{{ lastLoss('train_loss') }}</div><div class="k">train loss</div></div>
        <div class="s"><div class="v mono">{{ lastLoss('val_loss') }}</div><div class="k">val loss</div></div>
        <div class="s"><div class="v mono">{{ etaText }}</div><div class="k">预计剩余</div></div>
      </div>

      <div class="cwrap"><canvas ref="cv"></canvas></div>

      <div class="pbar">
        <div class="fill" :style="{ width: (progress * 100).toFixed(1) + '%' }"></div>
      </div>
      <div class="pl mono">{{ (progress * 100).toFixed(0) }}% · 任务 {{ taskId.slice(0, 8) }}…
        <span v-if="status === 'failed'" class="err">训练失败：{{ error }}</span>
      </div>
    </div>

    <div class="gp-card side">
      <div class="hd"><h3>训练中发生了什么</h3></div>
      <div class="bd">
        <p>模型正在学习一个<b>以空间{{ '' }}坐标为输入的权重网络</b>：每个位置得到一套自己的回归系数
          β(s)，再与协变量做线性组合得到预测。</p>
        <p><b>train</b> 曲线持续下降而 <b>val</b> 曲线回升时触发早停，自动回滚到验证集最优的一版权重——
          这就是「早停 patience」的作用。</p>
        <p class="mono dim">完成后自动进入结果看板：逐点系数地图 · 残差诊断 · 基线精度对比。</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useTrainingSocket } from '@/composables/useTrainingSocket'

const props = defineProps<{ taskId: string }>()
const emit = defineEmits<{ (e: 'done'): void; (e: 'failed', msg: string): void }>()

const { connected, progress, status, history, error, start } = useTrainingSocket()
const cv = ref<HTMLCanvasElement>()
const startAt = Date.now()

const curEpoch = computed(() => (history.value.length ? history.value[history.value.length - 1].epoch : 0))
const lastLoss = (k: 'train_loss' | 'val_loss') =>
  history.value.length ? history.value[history.value.length - 1][k].toFixed(4) : '—'
const etaText = computed(() => {
  if (progress.value <= 0.02) return '估算中…'
  const spent = (Date.now() - startAt) / 1000
  const remain = spent * (1 - progress.value) / progress.value
  return remain > 90 ? `${Math.round(remain / 60)} 分` : `${Math.round(remain)} 秒`
})

function drawLoss() {
  const c = cv.value; if (!c) return
  const ctx = c.getContext('2d')!
  const W = c.clientWidth || 700, H = 240, dpr = window.devicePixelRatio || 1
  c.width = W * dpr; c.height = H * dpr; c.style.height = H + 'px'
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H)
  const tr = history.value.map((h) => h.train_loss)
  const va = history.value.map((h) => h.val_loss)
  if (tr.length < 2) {
    ctx.fillStyle = 'rgba(147,161,176,.55)'; ctx.font = '12px sans-serif'
    ctx.fillText('等待首个 epoch 回传…', W / 2 - 60, H / 2); return
  }
  const all = tr.concat(va), lo = Math.min(...all), hi = Math.max(...all), pad = 34
  const sx = (i: number) => pad + (i / (tr.length - 1)) * (W - pad * 1.4)
  const sy = (v: number) => pad * 0.5 + (1 - (v - lo) / ((hi - lo) || 1)) * (H - pad * 1.5)
  ctx.strokeStyle = 'rgba(255,255,255,.08)'
  ctx.beginPath(); ctx.moveTo(pad, pad * 0.5); ctx.lineTo(pad, H - pad); ctx.lineTo(W - 8, H - pad); ctx.stroke()
  const line = (arr: number[], col: string) => {
    ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.beginPath()
    arr.forEach((v, i) => (i ? ctx.lineTo(sx(i), sy(v)) : ctx.moveTo(sx(i), sy(v)))); ctx.stroke()
  }
  line(tr, '#34D1BE'); line(va, '#e2b04a')
  ctx.font = '10px monospace'
  ctx.fillStyle = '#34D1BE'; ctx.fillText('train', W - 62, 18)
  ctx.fillStyle = '#e2b04a'; ctx.fillText('val', W - 62, 32)
  ctx.fillStyle = '#657081'
  ctx.fillText(hi.toFixed(3), 2, pad * 0.5 + 4); ctx.fillText(lo.toFixed(3), 2, H - pad)
  ctx.fillText('epoch ' + curEpoch.value, W / 2 - 26, H - 10)
}

watch(() => history.value.length, () => nextTick(drawLoss))
watch(status, (s) => {
  if (s === 'success') emit('done')
  else if (s === 'failed') emit('failed', error.value || '未知错误')
})
onMounted(() => { start(props.taskId, () => {}); drawLoss() })
</script>

<style scoped>
.mon { display: grid; grid-template-columns: 1fr 320px; gap: 16px; align-items: start; }
@media (max-width: 960px) { .mon { grid-template-columns: 1fr; } }
.hd { padding: 14px 16px; display: flex; justify-content: space-between; align-items: center;
  border-bottom: 1px solid var(--line); }
.hd h3 { margin: 0; font-size: 13.5px; font-weight: 560; }
.chan { font-size: 10.5px; color: var(--faint); }
.chan.ws { color: var(--accent); }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 14px 16px 4px; }
.s { text-align: center; background: rgba(255,255,255,.02); border: 1px solid var(--line);
  border-radius: 9px; padding: 10px 6px; }
.s .v { font-size: 17px; font-weight: 640; color: var(--accent); }
.s .k { font-size: 10.5px; color: var(--faint); margin-top: 2px; }
.cwrap { padding: 8px 12px; }
canvas { display: block; width: 100%; }
.pbar { height: 6px; background: rgba(255,255,255,.05); margin: 0 16px; border-radius: 4px; overflow: hidden; }
.fill { height: 100%; background: linear-gradient(90deg, #2a6f66, var(--accent)); transition: width .5s; }
.pl { padding: 8px 16px 16px; font-size: 11px; color: var(--faint); }
.err { color: #e26d5a; margin-left: 10px; }
.side .bd { padding: 12px 16px 16px; font-size: 12.5px; color: var(--muted); line-height: 1.75; }
.side .bd b { color: var(--text); font-weight: 560; }
.dim { color: var(--faint); font-size: 11px; }
</style>
