<template>
  <div class="ws">
    <!-- 流程步骤条 -->
    <div class="steps">
      <div class="crumb mono" @click="$router.push('/projects')">← 项目</div>
      <div class="proj">{{ project?.name || '工作台' }}
        <span class="sctag mono">{{ scLabel(project?.scenario_type) }}</span>
      </div>
      <div class="spring"></div>
      <div class="stepper">
        <span v-for="(s, i) in stepDefs" :key="s.key" class="stepitem mono"
              :class="{ on: ws.stage === s.key, done: stepIndex(ws.stage) > i }">
          <i>{{ i + 1 }}</i>{{ s.label }}
        </span>
      </div>
    </div>

    <!-- 1. 数据接入 -->
    <section v-show="ws.stage === 'upload'" class="stage">
      <UploadPanel :project-id="projectId" @ready="onUploaded" />
    </section>

    <!-- 2. 建模向导 -->
    <section v-show="ws.stage === 'wizard'" class="stage">
      <ModelingWizard v-if="preview" :project-id="projectId" :dataset-id="ws.datasetId"
                      :preview="preview" :scenario="project?.scenario_type || 'custom'"
                      @back="ws.stage = 'upload'" @submitted="onTrainSubmitted" />
    </section>

    <!-- 3. 训练监控 -->
    <section v-show="ws.stage === 'training'" class="stage">
      <TrainingMonitor v-if="ws.taskId" :task-id="ws.taskId" @done="onTrainDone" @failed="onTrainFailed" />
    </section>

    <!-- 4. 结果看板 -->
    <section v-show="ws.stage === 'result'" class="stage">
      <ResultDashboard v-if="ws.result" @restart="restart" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { datasetApi, modelApi, projectApi, type PreviewResponse, type ProjectOut } from '@/api'
import { useWorkspaceStore } from '@/stores/workspace'
import UploadPanel from '@/components/UploadPanel.vue'
import ModelingWizard from '@/components/ModelingWizard.vue'
import TrainingMonitor from '@/components/TrainingMonitor.vue'
import ResultDashboard from '@/components/ResultDashboard.vue'

const route = useRoute()
const ws = useWorkspaceStore()
const projectId = route.params.id as string
const project = ref<ProjectOut | null>(null)
const preview = ref<PreviewResponse | null>(null)

const stepDefs = [
  { key: 'upload', label: '数据接入' },
  { key: 'wizard', label: '建模配置' },
  { key: 'training', label: '训练监控' },
  { key: 'result', label: '结果看板' },
]
const stepIndex = (k: string) => stepDefs.findIndex((s) => s.key === k)
const scLabel = (s?: string) =>
  ({ air_quality: '大气污染 · GTNNWR', housing_price: '住宅价格 · GNNWR', custom: '自定义' } as Record<string, string>)[
    s || 'custom'
  ] || s

async function onUploaded(datasetId: string) {
  ws.datasetId = datasetId
  try {
    preview.value = await datasetApi.preview(datasetId)
    ws.stage = 'wizard'
  } catch { ElMessage.error('数据预览失败') }
}
function onTrainSubmitted(taskId: string) { ws.taskId = taskId; ws.stage = 'training' }

async function onTrainDone() {
  try {
    ws.result = await modelApi.result(ws.taskId)
    ws.compare = await modelApi.compare(ws.taskId)
    ws.coefficients = await modelApi.coefficients(ws.taskId)
    ws.stage = 'result'
  } catch { ElMessage.error('结果拉取失败') }
}
function onTrainFailed(msg: string) { ElMessage.error('训练失败：' + msg); ws.stage = 'wizard' }
function restart() { const r = useWorkspaceStore(); r.reset(); preview.value = null }

onMounted(async () => {
  ws.reset()
  try { project.value = await projectApi.get(projectId) } catch { /* ignore */ }
})
</script>

<style scoped>
.ws { max-width: 1320px; margin: 0 auto; padding: 20px 20px 64px; }
.steps { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; flex-wrap: wrap; }
.crumb { color: var(--muted); cursor: pointer; font-size: 12px; }
.proj { font-weight: 620; font-size: 15px; }
.sctag { font-size: 10px; color: var(--faint); margin-left: 8px; background: var(--panel-2);
  padding: 3px 8px; border-radius: 5px; }
.spring { flex: 1; }
.stepper { display: flex; gap: 4px; flex-wrap: wrap; }
.stepitem { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--faint);
  padding: 5px 10px; border-radius: 20px; }
.stepitem i { width: 16px; height: 16px; border-radius: 50%; display: grid; place-items: center;
  background: var(--raised); font-size: 9px; font-style: normal; }
.stepitem.on { color: var(--text); background: var(--accent-soft); }
.stepitem.on i { background: var(--accent-deep); color: #CFF6EF; }
.stepitem.done { color: var(--accent); }
.stage { min-height: 300px; }
</style>
