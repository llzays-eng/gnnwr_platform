import { defineStore } from 'pinia'
import type { CoefficientsOut, CompareOut, ResultOut } from '@/api'

// 工作台跨组件共享状态：当前数据集、训练任务、结果
export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({
    datasetId: '' as string,
    taskId: '' as string,
    stage: 'upload' as 'upload' | 'wizard' | 'training' | 'result',
    result: null as ResultOut | null,
    compare: null as CompareOut | null,
    coefficients: null as CoefficientsOut | null,
  }),
  actions: {
    reset() {
      this.datasetId = ''
      this.taskId = ''
      this.stage = 'upload'
      this.result = null
      this.compare = null
      this.coefficients = null
    },
  },
})
