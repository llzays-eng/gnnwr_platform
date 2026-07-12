<template>
  <div class="cmap">
    <!-- 引擎 A：高德真实底图（配置 key 后启用；pending 时也占位，避免 display:none 下初始化尺寸为 0） -->
    <div v-show="engine !== 'canvas'" ref="mapEl" class="amap-el"></div>

    <!-- 引擎 B：离线 Canvas 软渲染（零依赖降级） -->
    <canvas v-show="engine === 'canvas'" ref="cv"
            @mousemove="onCanvasMove" @mouseleave="hideTip"></canvas>

    <!-- 共享 hover 提示 -->
    <div class="tip mono" v-show="tip.show" :style="{ left: tip.x + 'px', top: tip.y + 'px' }"
         v-html="tip.html"></div>

    <div class="pend mono" v-if="engine === 'pending'">底图加载中…</div>
    <div class="offline mono" v-if="engine === 'canvas'">
      离线画布 · 配置 VITE_AMAP_KEY 可启用高德底图
    </div>
  </div>
</template>

<script setup lang="ts">
// 逐点系数/残差地图 —— 双引擎：
//   amap   ：高德 JS API 2.0 暗色底图 + CircleMarker（可平移缩放，坐标经 GCJ-02 纠偏）
//   canvas ：离线 Canvas 软渲染（无 key / 加载失败 / 内网环境自动降级）
// 两种引擎共用同一套色标（colormap.ts）与 tooltip，父组件无感知。
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { CoefPoint } from '@/api'
import { colorFor, FIELD_LABELS } from '@/composables/colormap'
import { amapConfigured, loadAMap } from '@/composables/useAMap'
import { wgs84ToGcj02 } from '@/composables/gcj02'

const props = defineProps<{
  points: CoefPoint[]
  temporal: boolean
  times: number[]
  variable: string
  mode: 'coef' | 'resid'
  timeIndex: number
  lo: number
  hi: number
  spans0: boolean
}>()
const emit = defineEmits<{ (e: 'engine', v: 'amap' | 'canvas'): void }>()

const engine = ref<'pending' | 'amap' | 'canvas'>('pending')
const mapEl = ref<HTMLDivElement>()
const cv = ref<HTMLCanvasElement>()

// ---- 共享：当前时间片的点 / 取值 / 提示 ----
const slicePts = computed<CoefPoint[]>(() =>
  props.temporal ? props.points.filter((p) => p.time === props.times[props.timeIndex]) : props.points,
)
const valOf = (p: CoefPoint) => (props.mode === 'resid' ? p.residual : (p.coef[props.variable] ?? 0))
const labelOf = (c: string) => FIELD_LABELS[c] || c

const tip = reactive({ show: false, x: 0, y: 0, html: '' })
function hideTip() { tip.show = false }
function tipHtml(p: CoefPoint, v: number): string {
  return (
    (props.mode === 'resid' ? `残差 = ${v.toFixed(3)}` : `${labelOf(props.variable)} 系数 = ${v.toFixed(3)}`) +
    `<br>(${p.lon.toFixed(3)}, ${p.lat.toFixed(3)})` +
    (props.temporal ? `<br>第 ${p.time} 天` : '')
  )
}
const dotRadius = (n: number) => (n > 600 ? 3.4 : n > 200 ? 4.4 : 6)

// ============================================================
// 引擎 A：高德底图
// ============================================================
let AMapNS: any = null
let map: any = null
let markers: { m: any; p: CoefPoint }[] = []
let fitted = false

async function initAmap() {
  AMapNS = await loadAMap()
  map = new AMapNS.Map(mapEl.value, {
    viewMode: '2D',
    zoom: 10,
    mapStyle: 'amap://styles/dark', // 与平台暗色主题一致
    resizeEnable: true,
  })
  map.on('movestart', hideTip)
  map.on('zoomstart', hideTip)
  buildMarkers()
}

function buildMarkers() {
  if (!map) return
  if (markers.length) map.remove(markers.map((x) => x.m))
  markers = []
  const pts = slicePts.value
  const R = dotRadius(pts.length)
  for (const p of pts) {
    // 数据坐标为 WGS84，高德底图为 GCJ-02：显示前做最后一次纠偏，否则全图系统性偏移 100~700m
    const [glon, glat] = wgs84ToGcj02(p.lon, p.lat)
    const v = valOf(p)
    const m = new AMapNS.CircleMarker({
      center: [glon, glat],
      radius: R,
      fillColor: colorFor(v, props.lo, props.hi, props.spans0),
      fillOpacity: 0.92,
      strokeColor: '#0B1015',
      strokeOpacity: 0.55,
      strokeWeight: 1,
      cursor: 'pointer',
      zIndex: 12,
    })
    m.on('mouseover', () => {
      const px = map.lngLatToContainer(m.getCenter())
      tip.html = tipHtml(p, v)
      tip.x = px.getX(); tip.y = px.getY(); tip.show = true
    })
    m.on('mouseout', hideTip)
    markers.push({ m, p })
  }
  map.add(markers.map((x) => x.m))
  if (!fitted && markers.length) {
    map.setFitView(markers.map((x) => x.m), true, [40, 40, 40, 40])
    fitted = true
  }
}

function recolorMarkers() {
  for (const { m, p } of markers) {
    m.setOptions({ fillColor: colorFor(valOf(p), props.lo, props.hi, props.spans0) })
  }
}

// ============================================================
// 引擎 B：离线 Canvas（与独立看板同一套画法）
// ============================================================
let hitPts: { cx: number; cy: number; p: CoefPoint; v: number }[] = []

function drawCanvas() {
  const c = cv.value; if (!c) return
  const ctx = c.getContext('2d')!
  const W = c.clientWidth || 760, H = c.clientHeight || Math.round(W * 0.62)
  const dpr = window.devicePixelRatio || 1
  c.width = W * dpr; c.height = H * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H)

  const all = props.points
  const lons = all.map((p) => p.lon), lats = all.map((p) => p.lat)
  const x0 = Math.min(...lons), x1 = Math.max(...lons)
  const y0 = Math.min(...lats), y1 = Math.max(...lats)
  const pad = 44, mw = W - pad * 2, mh = H - pad * 2
  const sx = (lon: number) => pad + ((lon - x0) / ((x1 - x0) || 1)) * mw
  const sy = (lat: number) => pad + (1 - (lat - y0) / ((y1 - y0) || 1)) * mh

  ctx.strokeStyle = 'rgba(255,255,255,.045)'
  for (let i = 0; i <= 6; i++) {
    const gx = pad + (mw * i) / 6, gy = pad + (mh * i) / 6
    ctx.beginPath(); ctx.moveTo(gx, pad); ctx.lineTo(gx, pad + mh); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(pad, gy); ctx.lineTo(pad + mw, gy); ctx.stroke()
  }

  const pts = slicePts.value
  const R = dotRadius(pts.length)
  hitPts = []
  for (const p of pts) {
    const v = valOf(p)
    const cx = sx(p.lon), cy = sy(p.lat)
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7)
    ctx.fillStyle = colorFor(v, props.lo, props.hi, props.spans0)
    ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1
    ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke()
    hitPts.push({ cx, cy, p, v })
  }

  ctx.fillStyle = 'rgba(147,161,176,.6)'; ctx.font = '10px monospace'
  ctx.fillText(`经度 ${x0.toFixed(2)}°`, pad, H - 14)
  ctx.fillText(`${x1.toFixed(2)}°`, W - pad - 34, H - 14)
}

function onCanvasMove(e: MouseEvent) {
  const r = cv.value!.getBoundingClientRect()
  const mx = e.clientX - r.left, my = e.clientY - r.top
  let best: (typeof hitPts)[number] | null = null, bd = 1e9
  for (const q of hitPts) { const d = (q.cx - mx) ** 2 + (q.cy - my) ** 2; if (d < bd) { bd = d; best = q } }
  if (best && bd < 220) {
    tip.html = tipHtml(best.p, best.v); tip.x = best.cx; tip.y = best.cy; tip.show = true
  } else tip.show = false
}

// ============================================================
// 生命周期与联动
// ============================================================
onMounted(async () => {
  if (amapConfigured()) {
    try {
      await initAmap()
      engine.value = 'amap'
    } catch (e) {
      console.warn('[CoefficientMap] 高德加载失败，降级为离线画布：', e)
      engine.value = 'canvas'
      await nextTick(); drawCanvas()
    }
  } else {
    engine.value = 'canvas'
    await nextTick(); drawCanvas()
  }
  emit('engine', engine.value as 'amap' | 'canvas')
})

// 变量 / 模式 / 色标范围变化 → 只需重着色
watch(
  () => [props.variable, props.mode, props.lo, props.hi, props.spans0],
  () => {
    hideTip()
    if (engine.value === 'amap') recolorMarkers()
    else if (engine.value === 'canvas') nextTick(drawCanvas)
  },
)
// 时间片变化 → 点集变化，重建
watch(slicePts, () => {
  hideTip()
  if (engine.value === 'amap') buildMarkers()
  else if (engine.value === 'canvas') nextTick(drawCanvas)
})

let rz: number | undefined
const onResize = () => { clearTimeout(rz); rz = window.setTimeout(() => { if (engine.value === 'canvas') drawCanvas() }, 150) }
window.addEventListener('resize', onResize)

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  if (map) { map.destroy(); map = null }
  markers = []
})
</script>

<style scoped>
.cmap { position: relative; }
.amap-el, canvas {
  display: block; width: 100%;
  height: clamp(360px, 52vh, 540px);
  border-radius: 8px; overflow: hidden;
}
canvas { background: rgba(255,255,255,.012); }
.tip {
  position: absolute; pointer-events: none; background: rgba(8,12,16,.96);
  border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px;
  font-size: 11.5px; transform: translate(-50%, -118%); white-space: nowrap; z-index: 120;
}
.pend {
  position: absolute; inset: 0; display: grid; place-items: center;
  font-size: 11.5px; color: var(--faint); background: rgba(14,20,27,.4); border-radius: 8px;
}
.offline {
  position: absolute; left: 10px; bottom: 10px; font-size: 10px; color: var(--faint);
  background: rgba(14,20,27,.75); border: 1px solid var(--line-soft);
  padding: 3px 8px; border-radius: 5px; pointer-events: none;
}
/* 高德版权信息在暗色主题下的对比度微调 */
.amap-el :deep(.amap-copyright) { opacity: .55; }
</style>
