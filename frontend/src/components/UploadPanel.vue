<template>
  <div class="wrap">
    <div class="gp-card up" :class="{ drag }"
         @dragover.prevent="drag = true" @dragleave.prevent="drag = false" @drop.prevent="onDrop">
      <input ref="fileEl" type="file" accept=".csv,.xlsx,.xls,.geojson,.json" hidden @change="onPick" />
      <div class="upinner" v-if="!uploading">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#34D1BE" stroke-width="1.4">
          <path d="M12 16V4M12 4l-4 4M12 4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>
        </svg>
        <h3>拖拽数据文件到此，或<a @click="fileEl?.click()">点击选择</a></h3>
        <p class="mono">支持 CSV · Excel · GeoJSON —— 需含经纬度列（及可选时间列）</p>
      </div>
      <div class="upinner" v-else>
        <el-progress type="circle" :percentage="pct" :width="86" color="#34D1BE" />
        <p class="mono" style="margin-top:14px">上传中 {{ file?.name }}</p>
      </div>
    </div>

    <div class="hints gp-card">
      <div class="gp-hd" style="padding:14px 16px 0">场景数据要求</div>
      <div class="bd">
        <div class="hintrow"><span class="k mono">大气污染 (GTNNWR)</span>
          <span>站点经纬度 + 观测日期 + AOD/气象协变量 + PM2.5 实测值</span></div>
        <div class="hintrow"><span class="k mono">住宅价格 (GNNWR)</span>
          <span>房源经纬度 + 面积/楼龄/地铁距离等属性 + 单价</span></div>
        <div class="note mono">
          坐标系可为 WGS84 / GCJ-02 / CGCS2000，入库时统一纠偏；下一步在建模向导中映射字段。
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { datasetApi } from '@/api'

const props = defineProps<{ projectId: string }>()
const emit = defineEmits<{ (e: 'ready', datasetId: string): void }>()

const fileEl = ref<HTMLInputElement>()
const drag = ref(false)
const uploading = ref(false)
const pct = ref(0)
const file = ref<File | null>(null)

function onDrop(e: DragEvent) { drag.value = false; const f = e.dataTransfer?.files?.[0]; if (f) upload(f) }
function onPick(e: Event) { const f = (e.target as HTMLInputElement).files?.[0]; if (f) upload(f) }

async function upload(f: File) {
  file.value = f; uploading.value = true; pct.value = 0
  try {
    const ds = await datasetApi.upload(props.projectId, f, (p) => (pct.value = p))
    emit('ready', ds.id)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.detail || '上传失败')
  } finally {
    uploading.value = false
  }
}
</script>

<style scoped>
.wrap { display: grid; grid-template-columns: 1fr 340px; gap: 16px; }
@media (max-width: 860px) { .wrap { grid-template-columns: 1fr; } }
.up { display: grid; place-items: center; min-height: 280px; border-style: dashed; transition: .15s; }
.up.drag { border-color: var(--accent); background: var(--accent-soft); }
.upinner { text-align: center; }
.upinner h3 { margin: 14px 0 6px; font-size: 15px; font-weight: 560; }
.upinner a { cursor: pointer; }
.upinner p { color: var(--faint); font-size: 11.5px; margin: 0; }
.bd { padding: 12px 16px 16px; }
.hintrow { display: flex; flex-direction: column; gap: 3px; padding: 9px 0; border-bottom: 1px solid var(--line-soft); }
.hintrow .k { font-size: 11px; color: var(--accent); }
.hintrow span:last-child { font-size: 12.5px; color: var(--muted); }
.note { margin-top: 12px; font-size: 11px; color: var(--faint); line-height: 1.6; }
</style>
