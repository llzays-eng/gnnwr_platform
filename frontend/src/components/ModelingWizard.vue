<template>
  <div class="wiz">
    <!-- 左：字段映射器 -->
    <div class="gp-card">
      <div class="gp-hd pad">
        <h3>字段映射器</h3>
        <span class="hint mono">{{ preview.n_rows_total }} 行 · {{ preview.columns.length }} 列</span>
      </div>
      <div class="bd">
        <!-- 模型类型 -->
        <div class="row">
          <label>模型类型</label>
          <div class="seg">
            <button :class="{ on: modelType === 'GNNWR' }" @click="modelType = 'GNNWR'">
              GNNWR <small>纯空间</small>
            </button>
            <button :class="{ on: modelType === 'GTNNWR' }" @click="modelType = 'GTNNWR'">
              GTNNWR <small>时空</small>
            </button>
          </div>
        </div>

        <div class="row">
          <label>目标变量 Y</label>
          <el-select v-model="yCol" placeholder="选择因变量" filterable style="width:100%">
            <el-option v-for="c in numericCols" :key="c" :value="c" :label="labelOf(c)" />
          </el-select>
        </div>

        <div class="row">
          <label>自变量 X（多选）</label>
          <el-select v-model="xCols" multiple collapse-tags collapse-tags-tooltip
                     placeholder="选择协变量" filterable style="width:100%">
            <el-option v-for="c in xCandidates" :key="c" :value="c" :label="labelOf(c)" />
          </el-select>
        </div>

        <div class="row two">
          <div>
            <label>经度列</label>
            <el-select v-model="lonCol" style="width:100%">
              <el-option v-for="c in numericCols" :key="c" :value="c" :label="c" />
            </el-select>
          </div>
          <div>
            <label>纬度列</label>
            <el-select v-model="latCol" style="width:100%">
              <el-option v-for="c in numericCols" :key="c" :value="c" :label="c" />
            </el-select>
          </div>
        </div>

        <div class="row" v-if="modelType === 'GTNNWR'">
          <label>时间列 <span class="req">GTNNWR 必填</span></label>
          <el-select v-model="tCol" placeholder="选择时间字段" style="width:100%">
            <el-option v-for="c in preview.columns" :key="c" :value="c" :label="c" />
          </el-select>
        </div>

        <!-- 数据划分 -->
        <div class="row">
          <label>数据集划分
            <span class="mono splitlab">训练 {{ trainPct }}% · 验证 {{ (validRatio * 100).toFixed(0) }}% · 测试 {{ (testRatio * 100).toFixed(0) }}%</span>
          </label>
          <div class="sliders">
            <div class="sl"><span class="mono">测试</span>
              <el-slider v-model="testRatio" :min="0.1" :max="0.4" :step="0.05" size="small" /></div>
            <div class="sl"><span class="mono">验证</span>
              <el-slider v-model="validRatio" :min="0.05" :max="0.3" :step="0.05" size="small" /></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右：网络结构与训练参数 -->
    <div class="gp-card">
      <div class="gp-hd pad"><h3>网络结构与训练超参数</h3><span class="hint mono">SWNN/STPNN</span></div>
      <div class="bd">
        <div class="row">
          <label>隐藏层结构</label>
          <div class="layers">
            <div v-for="(n, i) in hidden" :key="i" class="layer mono">
              <el-input-number v-model="hidden[i]" :min="4" :max="512" :step="8" size="small" controls-position="right" />
              <button class="x" @click="hidden.splice(i, 1)" v-if="hidden.length > 1">×</button>
            </div>
            <button class="add" @click="hidden.push(32)" v-if="hidden.length < 5">+ 加一层</button>
          </div>
        </div>

        <div class="row two">
          <div><label>Dropout</label>
            <el-input-number v-model="dropout" :min="0" :max="0.6" :step="0.05" size="small" style="width:100%" /></div>
          <div><label>学习率</label>
            <el-input-number v-model="lr" :min="0.0001" :max="0.1" :step="0.001" size="small" style="width:100%" /></div>
        </div>
        <div class="row two">
          <div><label>最大 Epoch</label>
            <el-input-number v-model="maxEpoch" :min="50" :max="2000" :step="50" size="small" style="width:100%" /></div>
          <div><label>早停 Patience</label>
            <el-input-number v-model="patience" :min="10" :max="300" :step="10" size="small" style="width:100%" /></div>
        </div>
        <div class="row">
          <label>Batch Size <span class="hint mono">留空=全量批</span></label>
          <el-input-number v-model="batchSize" :min="16" :max="4096" :step="16" size="small" style="width:100%" />
        </div>

        <div class="summary mono">
          {{ modelType }} · β(s{{ modelType === 'GTNNWR' ? ',t' : '' }}) 网络
          [{{ hidden.join(' → ') }}] · X 维度 {{ xCols.length }}
        </div>

        <div class="acts">
          <button class="ghost" @click="$emit('back')">← 重新上传</button>
          <button class="primary" :disabled="!canSubmit || submitting" @click="submit">
            {{ submitting ? '提交中…' : '提交训练任务 →' }}
          </button>
        </div>
        <p class="warn mono" v-if="warnMsg">{{ warnMsg }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { modelApi, type PreviewResponse } from '@/api'
import { FIELD_LABELS } from '@/composables/colormap'

const props = defineProps<{
  projectId: string
  datasetId: string
  preview: PreviewResponse
  scenario: string
}>()
const emit = defineEmits<{ (e: 'back'): void; (e: 'submitted', taskId: string): void }>()

const labelOf = (c: string) => (FIELD_LABELS[c] ? `${FIELD_LABELS[c]} (${c})` : c)

// ---- 字段映射：优先采用后端 mapping_suggestion，按场景给默认模型类型 ----
const sug = props.preview.mapping_suggestion
const modelType = ref<'GNNWR' | 'GTNNWR'>(
  props.scenario === 'air_quality' || sug.temporal ? 'GTNNWR' : 'GNNWR',
)
const yCol = ref(sug.y || '')
const xCols = ref<string[]>(sug.x || [])
const lonCol = ref(sug.lon || '')
const latCol = ref(sug.lat || '')
const tCol = ref(sug.temporal || '')

// 数值列候选：预览行里能转数字的列
const numericCols = computed(() =>
  props.preview.columns.filter((c) =>
    props.preview.rows.some((r) => r[c] !== null && r[c] !== '' && !isNaN(Number(r[c]))),
  ),
)
// X 候选剔除 Y 与坐标/时间列
const xCandidates = computed(() =>
  numericCols.value.filter((c) => c !== yCol.value && c !== lonCol.value && c !== latCol.value && c !== tCol.value),
)
watch([yCol, lonCol, latCol, tCol], () => {
  xCols.value = xCols.value.filter((c) => xCandidates.value.includes(c))
})

// ---- 划分与超参 ----
const testRatio = ref(0.2)
const validRatio = ref(0.1)
const trainPct = computed(() => Math.round((1 - testRatio.value - validRatio.value) * 100))
const hidden = ref<number[]>([64, 32])
const dropout = ref(0.1)
const lr = ref(0.008)
const maxEpoch = ref(400)
const patience = ref(60)
const batchSize = ref<number | undefined>(undefined)

const canSubmit = computed(
  () =>
    !!yCol.value && xCols.value.length > 0 && !!lonCol.value && !!latCol.value &&
    (modelType.value === 'GNNWR' || !!tCol.value) && trainPct.value >= 40,
)
const warnMsg = computed(() => {
  if (trainPct.value < 40) return '训练集占比过低（<40%），请调小测试/验证比例'
  if (modelType.value === 'GTNNWR' && !tCol.value) return 'GTNNWR 需要指定时间列'
  return ''
})

const submitting = ref(false)
async function submit() {
  submitting.value = true
  try {
    const t = await modelApi.train({
      project_id: props.projectId,
      dataset_id: props.datasetId,
      model_type: modelType.value,
      y_column: yCol.value,
      x_columns: xCols.value,
      spatial_columns: [lonCol.value, latCol.value],
      temporal_column: modelType.value === 'GTNNWR' ? tCol.value : null,
      test_ratio: testRatio.value,
      valid_ratio: validRatio.value,
      hyperparams: {
        hidden: hidden.value, dropout: dropout.value, lr: lr.value,
        max_epoch: maxEpoch.value, patience: patience.value, batch_size: batchSize.value ?? null,
      },
    })
    emit('submitted', t.task_id)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.detail || '任务提交失败')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.wiz { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
@media (max-width: 960px) { .wiz { grid-template-columns: 1fr; } }
.pad { padding: 14px 16px; display: flex; justify-content: space-between; align-items: baseline; }
.pad h3 { margin: 0; font-size: 13.5px; font-weight: 560; }
.hint { font-size: 11px; color: var(--faint); }
.bd { padding: 14px 16px 18px; }
.row { margin-bottom: 16px; }
.row.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.row label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.req { color: var(--warn, #e2b04a); font-size: 10.5px; margin-left: 6px; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.seg button { background: transparent; color: var(--muted); border: 0; padding: 8px 16px;
  cursor: pointer; font-family: var(--sans); font-size: 12.5px; }
.seg button small { display: block; font-size: 9.5px; color: var(--faint); }
.seg button.on { background: var(--accent-soft); color: var(--accent); }
.seg button.on small { color: var(--accent); opacity: .75; }
.splitlab { float: right; color: var(--accent); font-size: 10.5px; }
.sliders .sl { display: grid; grid-template-columns: 34px 1fr; gap: 10px; align-items: center; }
.sliders .sl span { font-size: 10.5px; color: var(--faint); }
.layers { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.layer { display: flex; align-items: center; gap: 3px; }
.layer .x { background: none; border: 0; color: var(--faint); cursor: pointer; font-size: 14px; }
.layer .x:hover { color: #e26d5a; }
.add { background: none; border: 1px dashed var(--line); border-radius: 7px; color: var(--muted);
  padding: 6px 10px; cursor: pointer; font-size: 11.5px; }
.add:hover { color: var(--accent); border-color: var(--accent); }
.summary { margin: 4px 0 14px; font-size: 11px; color: var(--faint); background: var(--panel-2, rgba(255,255,255,.03));
  border: 1px solid var(--line-soft, var(--line)); border-radius: 8px; padding: 9px 11px; }
.acts { display: flex; justify-content: space-between; gap: 10px; }
.ghost { background: none; border: 1px solid var(--line); color: var(--muted); border-radius: 8px;
  padding: 9px 14px; cursor: pointer; font-size: 12.5px; }
.primary { background: var(--accent); color: #06231F; border: 0; border-radius: 8px;
  padding: 9px 18px; cursor: pointer; font-weight: 620; font-size: 12.5px; }
.primary:disabled { opacity: .45; cursor: not-allowed; }
.warn { margin: 10px 0 0; font-size: 11px; color: var(--warn, #e2b04a); }
</style>
