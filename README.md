# GNNWR 时空智能分析云平台（Monorepo）

把 **GNNWR / GTNNWR** 做成「上传数据 → 点选参数 → 看地图动画」的 Web 平台。

本仓库为**产品主仓**：已用独立前端 WebGIS P0 与独立后端（含安全修复）**覆盖**旧的 `frontend/` / `backend/` / `engine/`。

| 目录 | 内容 |
|---|---|
| `frontend/` | Vue3 + TS 独立前端（阶段轨、MapAdapter、CRS 品牌类型） |
| `backend/` | FastAPI + Celery（`app/` + 同目录 `engine/`） |
| `engine/` | 与 backend 同步的建模引擎副本（便于根目录脚本/对照） |
| `deploy/` | PostGIS 初始化 |
| `demo/` | 历史离线看板（可选） |

## 快速启动（Docker）

```bash
cp .env.example .env
# 生产务必修改 SECRET_KEY 与数据库密码
docker compose up -d --build
```

- 前端：http://localhost:5173  
- API 文档：http://localhost:8000/docs  
- 可选 GeoServer：`docker compose --profile extras up -d`

## 本地开发

```bash
# 基础设施
docker compose up -d postgis redis minio

# 后端
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
celery -A app.tasks.celery_app.celery_app worker -Q cpu_queue,gpu_queue -l info

# 前端
cd frontend && pnpm install && pnpm dev
```

前端 `.env.local` 参考 `frontend/.env.example`：`VITE_API_BASE_URL=http://127.0.0.1:8000`，联调时 `VITE_ENABLE_MOCK=false`。

## 契约要点（WebGIS）

- 矢量：库内 **WGS84**；API 默认出 WGS84，前端 `toRenderCRS` 上高德（GCJ-02）
- 栅格曲面：响应含 **`tile_crs`（默认 GCJ02）**，XYZ/WMS 带短时 `sig`
- 训练进度 WebSocket：`/ws/models/tasks/{task_id}?token=`

## 来源

合并自：

- `gnnwr_platform_backend` @ `cursor/gnnwr-backend-service-b8eb`
- `gnnwr_platform_frontend` @ `cursor/webgis-p0-crs-contract-b1d2`

分仓仍可作历史参考；**日常开发以本 monorepo 为准**。
