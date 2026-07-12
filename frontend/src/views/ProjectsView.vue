<template>
  <div class="page">
    <div class="head">
      <div>
        <div class="eyebrow mono">Projects</div>
        <h2>分析项目</h2>
        <p>每个项目绑定一个应用场景，可上传多份数据、发起多次建模。</p>
      </div>
      <el-button type="primary" @click="showNew = true">新建项目</el-button>
    </div>

    <div v-if="loading" class="empty mono">加载中…</div>
    <div v-else-if="!projects.length" class="empty">
      还没有项目。点击「新建项目」，选择大气污染或住宅价格场景开始。
    </div>
    <div v-else class="grid">
      <div v-for="p in projects" :key="p.id" class="pcard" @click="open(p)">
        <div class="ptag mono" :class="p.scenario_type">{{ scLabel(p.scenario_type) }}</div>
        <h3>{{ p.name }}</h3>
        <div class="pmeta mono">{{ fmtDate(p.created_at) }}</div>
        <div class="popen mono">进入工作台 →</div>
      </div>
    </div>

    <el-dialog v-model="showNew" title="新建分析项目" width="440px">
      <el-form label-position="top">
        <el-form-item label="项目名称">
          <el-input v-model="newName" placeholder="如：京津冀 PM2.5 反演 2024Q1" />
        </el-form-item>
        <el-form-item label="应用场景">
          <el-radio-group v-model="newScenario">
            <el-radio-button value="air_quality">大气污染 · GTNNWR</el-radio-button>
            <el-radio-button value="housing_price">住宅价格 · GNNWR</el-radio-button>
            <el-radio-button value="custom">自定义</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showNew = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="create">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { projectApi, type ProjectOut } from '@/api'

const router = useRouter()
const projects = ref<ProjectOut[]>([])
const loading = ref(true)
const showNew = ref(false)
const creating = ref(false)
const newName = ref('')
const newScenario = ref('air_quality')

const scLabel = (s: string) =>
  ({ air_quality: '大气污染', housing_price: '住宅价格', custom: '自定义' } as Record<string, string>)[s] || s
const fmtDate = (s: string) => new Date(s).toLocaleString('zh-CN')

async function load() {
  loading.value = true
  try { projects.value = await projectApi.list() }
  catch { ElMessage.error('加载项目失败') }
  finally { loading.value = false }
}
async function create() {
  if (!newName.value) return ElMessage.warning('请填写项目名称')
  creating.value = true
  try {
    const p = await projectApi.create(newName.value, newScenario.value)
    showNew.value = false; newName.value = ''
    router.push(`/projects/${p.id}/workspace`)
  } catch { ElMessage.error('创建失败') }
  finally { creating.value = false }
}
function open(p: ProjectOut) { router.push(`/projects/${p.id}/workspace`) }

onMounted(load)
</script>

<style scoped>
.page { max-width: 1080px; margin: 0 auto; padding: 34px 24px 64px; }
.head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 28px; }
.eyebrow { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: var(--accent); margin-bottom: 6px; }
.head h2 { margin: 0 0 6px; font-size: 24px; font-weight: 660; }
.head p { margin: 0; color: var(--muted); font-size: 13px; }
.empty { padding: 60px 20px; text-align: center; color: var(--faint);
  border: 1px dashed var(--line); border-radius: 12px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
.pcard { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 18px;
  cursor: pointer; transition: .15s; }
.pcard:hover { border-color: var(--accent-deep); transform: translateY(-2px); }
.ptag { display: inline-block; font-size: 10px; padding: 3px 8px; border-radius: 5px;
  background: var(--raised); color: var(--muted); margin-bottom: 12px; }
.ptag.air_quality { color: #8FBEEA; } .ptag.housing_price { color: var(--warn); }
.pcard h3 { margin: 0 0 8px; font-size: 15px; font-weight: 600; }
.pmeta { font-size: 11px; color: var(--faint); }
.popen { margin-top: 14px; font-size: 11.5px; color: var(--accent); }
</style>
