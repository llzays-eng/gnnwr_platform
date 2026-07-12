<template>
  <div class="rd" v-if="ws.result && ws.coefficients">
    <!-- 左：逐点系数地图（高德底图 / 离线画布 双引擎） -->
    <section class="gp-card">
      <div class="toolbar">
        <div class="fld">
          <label>局部回归系数</label>
          <el-select v-model="curVar" size="small" style="width:170px" :disabled="mode === 'resid'">
            <el-option v-for="c in coef.columns" :key="c" :value="c" :label="labelOf(c)" />
          </el-select>
        </div>
        <div class="seg">
          <button :class="{ on: mode === 'coef' }" @click="mode = 'coef'">系数分布</button>
          <button :class="{ on: mode === 'resid' }" @click="mode = 'resid'">残差诊断</button>
        </div>
        <span class="engine mono" :class="engineKind" v-if="engineKind">
          {{ engineKind === 'amap' ? '◉ 高德底图' : '◌ 离线画布' }}
        </span>
        <div class="cbar-wrap">
          <span class="cl mono">{{ rangeLo.toFixed(2) }}</span>
          <div class="cbar" :style="{ background: cbarCss }"></div>
          <span class="cl mono">{{ rangeHi >= 0 ? '+' : '' }}{{ rangeHi.toFixed(2) }}</span>
        </div>
      </div>

      <div class="mapwrap">
        <CoefficientMap
          :points="coef.points" :temporal="coef.temporal" :times="coef.times"
          :variable="curVar" :mode="mode" :time-index="curTime"
          :lo="rangeLo" :hi="rangeHi" :spans0="rr.spans0"
          @engine="engineKind = $event"
        />
      </div>

      <div class="timebar" v-if="coef.temporal && coef.times.length">
        <button class="play" @click="togglePlay">{{ playing ? '❚❚' : '▶' }}</button>
        <el-slider v-model="curTime" :min="0" :max="coef.times.length - 1" :step="1" size="small" style="flex:1" />
        <span class="tl mono">第 {{ coef.times[curTime] }} 天</span>
      </div>

      <div class="note" v-html="noteHtml"></div>
    </section>

    <!-- 右：指标 / 对比 / 操作 -->
    <aside class="col">
      <div class="gp-card">
        <div class="hd"><h3>模型精度（测试集）</h3><span class="hint mono">{{ ws.result.model_type }}</span></div>
        <div class="bd metrics">
          <div class="m" v-for="[k, v] in metricItems" :key="k">
            <div class="v mono">{{ v ?? '—' }}</div><div class="k mono">{{ k }}</div>
          </div>
        </div>
      </div>

      <div class="gp-card" v-if="ws.compare">
        <div class="hd"><h3>与基线模型对比</h3><span class="hint mono">R² 越高越好</span></div>
        <div class="bd">
          <div class="bar-row" v-for="r in compareRows" :key="r.method">
            <div class="name mono" :class="{ hl: r.hl }">{{ r.method }}</div>
            <div class="track"><div class="fill" :class="{ dim: !r.hl }"
                 :style="{ width: (r.r2 / maxR2 * 100).toFixed(1) + '%' }"></div></div>
            <div class="val mono">{{ r.r2.toFixed(3) }}</div>
          </div>
          <div class="insight">
            <b>{{ ws.result.model_type }}</b> 比全局 OLS 高
            <b>{{ olsGapPct }}</b> 个百分点 R²。切换左侧变量可看到系数
            <b>随位置改变甚至变号</b>——这正是全局回归无法表达、而本平台可视化出来的空间非平稳性。
          </div>
        </div>
      </div>

      <div class="gp-card">
        <div class="hd"><h3>产出与操作</h3></div>
        <div class="bd acts">
          <button class="primary" :disabled="exporting" @click="exportPdf">
            {{ exporting ? '生成中…' : '导出 PDF 技术报告' }}
          </button>
          <button class="ghost" @click="$emit('restart')">↩ 新建分析</button>
        </div>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { http } from '@/api/client'
import { useWorkspaceStore } from '@/stores/workspace'
import { cbarGradient, FIELD_LABELS, robustRange } from '@/composables/colormap'
import CoefficientMap from '@/components/CoefficientMap.vue'

defineEmits<{ (e: 'restart'): void }>()
const ws = useWorkspaceStore()
const coef = computed(() => ws.coefficients!)
const labelOf = (c: string) => FIELD_LABELS[c] || c

// ---- 状态 ----
const mode = ref<'coef' | 'resid'>('coef')
const curVar = ref('')
const curTime = ref(0)
const playing = ref(false)
const engineKind = ref<'' | 'amap' | 'canvas'>('')
let timer: number | null = null

// ---- 色标范围（系数按全部时间片统一，动画帧间才可比） ----
const scaleVals = computed(() =>
  mode.value === 'resid'
    ? coef.value.points.map((p) => p.residual)
    : coef.value.points.map((p) => p.coef[curVar.value] ?? 0),
)
const rr = computed(() => {
  let [lo, hi] = robustRange(scaleVals.value)
  const spans0 = mode.value === 'resid' || (lo < 0 && hi > 0)
  if (spans0) { const m = Math.max(Math.abs(lo), Math.abs(hi)); lo = -m; hi = m }
  return { lo, hi, spans0 }
})
const rangeLo = computed(() => rr.value.lo)
const rangeHi = computed(() => rr.value.hi)
const cbarCss = computed(() => cbarGradient(rr.value.lo, rr.value.hi, rr.value.spans0))

// ---- 时间轴播放 ----
function togglePlay() {
  if (playing.value) { if (timer) clearInterval(timer); timer = null; playing.value = false; return }
  playing.value = true
  timer = window.setInterval(() => { curTime.value = (curTime.value + 1) % coef.value.times.length }, 650)
}

// ---- 指标 / 对比 ----
const metricItems = computed(() => {
  const m = ws.result!.metrics
  const f = (v: number | null) => (v == null ? null : v.toFixed(v > 100 ? 1 : 4))
  return [['R²', f(m.r2)], ['RMSE', f(m.rmse)], ['MAE', f(m.mae)], ['AICc', f(m.aicc)]] as [string, string | null][]
})
const compareRows = computed(() => {
  const c = ws.compare!
  const rows = [{ method: c.model_type, r2: c.main.r2 ?? 0, hl: true },
    ...c.baselines.map((b) => ({ method: b.method, r2: b.r2 ?? 0, hl: false }))]
  return rows.sort((a, b) => b.r2 - a.r2)
})
const maxR2 = computed(() => Math.max(...compareRows.value.map((r) => r.r2), 0.01))
const olsGapPct = computed(() => {
  const ols = ws.compare?.baselines.find((b) => b.method === 'OLS')
  const main = ws.compare?.main.r2
  return ols?.r2 != null && main != null ? ((main - ols.r2) * 100).toFixed(1) : '—'
})
const noteHtml = computed(() => {
  const beta = ws.result?.beta_ols?.[curVar.value]
  return mode.value === 'resid'
    ? '颜色表示<b>残差</b>（观测−预测）。残差成片同号提示该片区仍有未解释结构；均匀近零说明拟合良好。'
    : `颜色表示该位置 <b>${labelOf(curVar.value)}</b> 的<b>局部回归系数</b>。` +
      (beta != null ? `<span class="kbd mono">全局 OLS 系数 = ${(+beta).toFixed(3)}</span>` : '') +
      `——${ws.result!.model_type} 把一个全局数字变成了一整片随空间${coef.value.temporal ? '/时间' : ''}变化的系数场。`
})

// ---- PDF 导出（带 JWT，走 blob 下载）----
const exporting = ref(false)
async function exportPdf() {
  exporting.value = true
  try {
    const resp = await http.get(`/reports/${ws.taskId}/export`, { responseType: 'blob', timeout: 120000 })
    const ext = String(resp.headers['content-type'] || '').includes('pdf') ? 'pdf' : 'html'
    const url = URL.createObjectURL(resp.data)
    const a = document.createElement('a')
    a.href = url; a.download = `GNNWR技术报告_${ws.taskId.slice(0, 8)}.${ext}`; a.click()
    URL.revokeObjectURL(url)
  } catch { ElMessage.error('报告导出失败') } finally { exporting.value = false }
}

// ---- 初始化 ----
onMounted(() => {
  const cols = coef.value.columns
  curVar.value = cols.find((c) => c !== 'intercept') || cols[0] || ''
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.rd { display: grid; grid-template-columns: 1fr 360px; gap: 16px; align-items: start; }
@media (max-width: 1000px) { .rd { grid-template-columns: 1fr; } }
.col { display: flex; flex-direction: column; gap: 16px; }
.toolbar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 12px 16px;
  border-bottom: 1px solid var(--line); }
.fld { display: flex; align-items: center; gap: 8px; }
.fld label { font-size: 11.5px; color: var(--muted); }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 7px; overflow: hidden; }
.seg button { background: transparent; color: var(--muted); border: 0; padding: 6px 12px;
  font-size: 12px; cursor: pointer; font-family: var(--sans); }
.seg button.on { background: var(--accent-soft); color: var(--accent); }
.engine { font-size: 10.5px; padding: 3px 9px; border-radius: 12px; border: 1px solid var(--line); }
.engine.amap { color: var(--accent); border-color: var(--accent-deep); background: var(--accent-soft); }
.engine.canvas { color: var(--faint); }
.cbar-wrap { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.cbar { width: 160px; height: 11px; border-radius: 6px; border: 1px solid var(--line); }
.cl { font-size: 10.5px; color: var(--faint); }
.mapwrap { padding: 10px; }
.timebar { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-top: 1px solid var(--line); }
.play { width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--accent);
  background: var(--accent-soft); color: var(--accent); cursor: pointer; flex: 0 0 auto; }
.tl { font-size: 11.5px; color: var(--accent); min-width: 80px; text-align: right; }
.note { padding: 11px 16px; font-size: 11.5px; color: var(--faint); line-height: 1.65;
  border-top: 1px solid var(--line); }
.note :deep(b) { color: var(--muted); font-weight: 560; }
.note :deep(.kbd) { color: var(--accent); background: var(--accent-soft); padding: 1px 6px;
  border-radius: 4px; margin: 0 4px; font-size: 10.5px; }
.hd { padding: 13px 16px; border-bottom: 1px solid var(--line); display: flex;
  justify-content: space-between; align-items: baseline; }
.hd h3 { margin: 0; font-size: 13px; font-weight: 560; }
.hint { font-size: 10.5px; color: var(--faint); }
.bd { padding: 13px 16px 16px; }
.metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.m { text-align: center; background: rgba(255,255,255,.02); border: 1px solid var(--line);
  border-radius: 9px; padding: 10px 4px; }
.m .v { font-size: 16.5px; font-weight: 640; color: var(--accent); }
.m .k { font-size: 10px; color: var(--faint); margin-top: 2px; }
.bar-row { display: grid; grid-template-columns: 82px 1fr 50px; align-items: center; gap: 9px; padding: 5px 0; }
.bar-row .name { font-size: 11.5px; color: var(--muted); text-align: right; }
.bar-row .name.hl { color: var(--accent); font-weight: 620; }
.track { height: 14px; background: rgba(255,255,255,.03); border-radius: 5px; overflow: hidden;
  border: 1px solid var(--line); }
.fill { height: 100%; background: linear-gradient(90deg, #2a6f66, var(--accent)); }
.fill.dim { background: linear-gradient(90deg, #2b3540, #4a5765); }
.bar-row .val { font-size: 11.5px; color: var(--muted); text-align: right; }
.insight { margin-top: 10px; font-size: 12px; color: var(--muted); line-height: 1.7;
  border-left: 2px solid var(--accent); padding-left: 12px; }
.insight b { color: var(--text); }
.acts { display: flex; gap: 10px; }
.primary { flex: 1; background: var(--accent); color: #06231F; border: 0; border-radius: 8px;
  padding: 10px 14px; cursor: pointer; font-weight: 620; font-size: 12.5px; }
.primary:disabled { opacity: .5; }
.ghost { background: none; border: 1px solid var(--line); color: var(--muted); border-radius: 8px;
  padding: 10px 14px; cursor: pointer; font-size: 12.5px; }
</style>
