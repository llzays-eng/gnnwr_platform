import { http } from './client'

// ============ 类型（对齐 backend/app/schemas） ============
export interface Token { access_token: string; token_type: string; role: string }
export interface UserOut { id: string; email: string; username: string; role: string }
export interface ProjectOut { id: string; name: string; scenario_type: string; created_at: string }
export interface DatasetOut {
  id: string; name: string; file_type: string; source_crs: string
  row_count: number; status: string; created_at: string
}
export interface PreviewResponse {
  columns: string[]
  rows: Record<string, unknown>[]
  n_rows_total: number
  mapping_suggestion: { lon?: string; lat?: string; temporal?: string; y?: string; x?: string[] }
  points: { lon: number; lat: number }[]
}
export interface Hyperparams {
  hidden: number[]; dropout: number; lr: number
  max_epoch: number; patience: number; batch_size: number | null
}
export interface TrainRequest {
  project_id: string; dataset_id: string
  model_type: 'GNNWR' | 'GTNNWR'
  y_column: string; x_columns: string[]; spatial_columns: string[]
  temporal_column: string | null
  test_ratio: number; valid_ratio: number
  hyperparams: Hyperparams
}
export interface Metrics { r2: number | null; rmse: number | null; mae: number | null; aicc: number | null }
export interface TaskStatusOut {
  task_id: string; status: string; progress: number; model_type: string; error: string | null
}
export interface ResultOut {
  task_id: string; status: string; model_type: string
  metrics: Metrics; beta_ols: Record<string, number>; coefficients_key: string | null
}
export interface BaselineOut { method: string; r2: number | null; rmse: number | null; mae: number | null }
export interface CompareOut { task_id: string; model_type: string; main: Metrics; baselines: BaselineOut[] }
export interface CoefPoint { lon: number; lat: number; time?: number; coef: Record<string, number>; residual: number }
export interface CoefficientsOut { columns: string[]; points: CoefPoint[]; temporal: boolean; times: number[] }

// ============ 端点 ============
export const authApi = {
  register: (email: string, username: string, password: string) =>
    http.post<UserOut>('/auth/register', { email, username, password }).then((r) => r.data),
  login: (username: string, password: string) => {
    const form = new URLSearchParams({ username, password }) // OAuth2PasswordRequestForm
    return http
      .post<Token>('/auth/login', form, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
      .then((r) => r.data)
  },
  me: () => http.get<UserOut>('/auth/me').then((r) => r.data),
}

export const projectApi = {
  list: () => http.get<ProjectOut[]>('/projects').then((r) => r.data),
  create: (name: string, scenario_type: string) =>
    http.post<ProjectOut>('/projects', { name, scenario_type }).then((r) => r.data),
  get: (id: string) => http.get<ProjectOut>(`/projects/${id}`).then((r) => r.data),
}

export const datasetApi = {
  list: (projectId: string) =>
    http.get<DatasetOut[]>('/datasets', { params: { project_id: projectId } }).then((r) => r.data),
  upload: (projectId: string, file: File, onProgress?: (pct: number) => void) => {
    const fd = new FormData()
    fd.append('project_id', projectId)
    fd.append('file', file)
    return http
      .post<DatasetOut>('/datasets/upload', fd, {
        onUploadProgress: (e) => onProgress && e.total && onProgress(Math.round((e.loaded / e.total) * 100)),
      })
      .then((r) => r.data)
  },
  preview: (datasetId: string) =>
    http.get<PreviewResponse>(`/datasets/${datasetId}/preview`).then((r) => r.data),
  preprocess: (datasetId: string, body: Record<string, unknown>) =>
    http.post(`/datasets/${datasetId}/preprocess`, body).then((r) => r.data),
}

export const modelApi = {
  train: (req: TrainRequest) => http.post<TaskStatusOut>('/models/train', req).then((r) => r.data),
  status: (taskId: string) =>
    http.get<TaskStatusOut>(`/models/tasks/${taskId}/status`).then((r) => r.data),
  result: (taskId: string) => http.get<ResultOut>(`/models/tasks/${taskId}/result`).then((r) => r.data),
  compare: (taskId: string) => http.get<CompareOut>(`/models/tasks/${taskId}/compare`).then((r) => r.data),
  coefficients: (taskId: string) =>
    http.get<CoefficientsOut>(`/models/tasks/${taskId}/coefficients`).then((r) => r.data),
}
