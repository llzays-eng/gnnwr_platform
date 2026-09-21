# 组合式函数

跨模块复用的放这里；只服务单一模块的放该模块的 `composables/`。

已落地：
- `useFeatureWorker.ts` —— 要素解析 Worker 的单例封装

各模块内：
- `modules/dataset/composables/useUpload.ts` —— 上传，含分片能力探测与回落
- `modules/dataset/composables/useColumnInference.ts` —— 列识别与坐标系建议
- `modules/monitor/composables/useTaskSocket.ts` —— 训练进度双通道接入组件生命周期
- `modules/dashboard/composables/useCoefficientField.ts` —— 逐点系数访问抽象层
- `modules/dashboard/composables/useMapChartLink.ts` —— 地图与图表联动
