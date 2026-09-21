/**
 * 后端已冻结的接口清单。
 *
 * 纪律: 前端只允许调用 FROZEN 里的路径。
 * 缺功能进 PENDING, 并同步写进 docs/接口协商清单.md, 不得自行编造。
 * PENDING 里的每一条在 Mock 层都有实现, 但受 VITE_MOCK_ASSUME_PENDING_CONTRACTS 控制,
 * 关掉开关即可看到「哪些页面因缺接口而残废」。
 *
 * 联调基线: 独立前端 × gnnwr_platform_backend(PR #1+)。
 * 下列 list / 分片 / coefficients / cancel / logout 已在该后端落地, 从 PENDING 解冻。
 */
export const FROZEN = {
  login: '/api/v1/auth/login',
  logout: '/api/v1/auth/logout',
  createProject: '/api/v1/projects',
  listProjects: '/api/v1/projects',
  projectDetail: (id: string) => `/api/v1/projects/${id}`,
  listDatasets: '/api/v1/datasets',
  uploadDataset: '/api/v1/datasets/upload',
  uploadInit: '/api/v1/datasets/upload/init',
  uploadChunk: (uid: string, n: number) => `/api/v1/datasets/upload/${uid}/chunk/${n}`,
  uploadComplete: (uid: string) => `/api/v1/datasets/upload/${uid}/complete`,
  preprocessDataset: (id: string) => `/api/v1/datasets/${id}/preprocess`,
  previewDataset: (id: string) => `/api/v1/datasets/${id}/preview`,
  train: '/api/v1/models/train',
  listTasks: '/api/v1/models/tasks',
  taskStatus: (id: string) => `/api/v1/models/tasks/${id}/status`,
  taskSocket: (id: string) => `/ws/models/tasks/${id}`,
  taskResult: (id: string) => `/api/v1/models/tasks/${id}/result`,
  taskCompare: (id: string) => `/api/v1/models/tasks/${id}/compare`,
  coefficients: (id: string) => `/api/v1/models/tasks/${id}/coefficients`,
  cancelTask: (id: string) => `/api/v1/models/tasks/${id}/cancel`,
  taskLogs: (id: string) => `/api/v1/models/tasks/${id}/logs`,
  tiles: '/api/v1/spatial/tiles',
  surface: (id: string) => `/api/v1/spatial/surface/${id}`,
  exportReport: (id: string) => `/api/v1/reports/${id}/export`,
} as const;

/** 尚未与后端确认。每一条都对应 docs/接口协商清单.md 的编号。 */
export const PENDING = {
  /** #7 报告异步任务状态。后端仍是同步导出, 前端探测兼容。 */
  reportJob: (jobId: string) => `/api/v1/reports/jobs/${jobId}`,
  /** #6 配置模板仍未提供, 前端继续用 localStorage。 */
  configTemplates: '/api/v1/config-templates',
} as const;
