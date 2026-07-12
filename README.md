# GNNWR 时空智能分析云平台

把 **GNNWR / GTNNWR**（地理时空神经网络加权回归）从"需要写 Python 代码才能跑的模型"，变成"**上传数据 → 点选参数 → 看地图动画**"的零代码云端建模工具。实现完全对照《项目架构大纲》的四层 B/S 架构与两个核心验证场景（大气污染物时空反演 / 城市住宅价格空间分异）。

## 30 秒看到成果

无需安装任何东西：**双击打开 `demo/GNNWR平台_结果看板.html`**（零依赖单文件，离线可用）。

看板内嵌的是本仓库 `engine/` 真实训练导出的结果（非预设数值）：

| 场景 | 本平台模型 | GWR/GTWR | OLS | 随机森林 |
|---|---|---|---|---|
| 城市住宅价格（340 房源点） | **GNNWR R²=0.894** | 0.882 | 0.824 | 0.704 |
| 大气污染物 PM2.5（90 站 × 14 天） | **GTNNWR R²=0.899** | 0.813 | 0.804 | 0.835 |

看板中可交互验证平台的核心卖点：切换「绿化率 / 容积率」等变量，能看到局部回归系数**跨空间正负变号**（全局回归给出的只是一个数）；大气场景可播放时间轴，观察 AOD→PM2.5 转换系数的时空演变。

## 目录结构

```
gnnwr-platform/
├── engine/                  # ④算力层·建模引擎（纯 numpy 版 GNNWR/GTNNWR，离线可跑）
│   ├── gnnwr_lite.py        #   核心：β(s[,t]) = MLP(坐标)，手写 Adam + 早停 + 逐点系数
│   ├── baselines.py         #   OLS / 自适应带宽 GWR / GTWR / RandomForest 基线
│   ├── data.py              #   两场景合成数据（内置已知的空间非平稳真值，用于验证）
│   ├── pipeline.py          #   run_pipeline + v1 兼容接口 run_analysis/FieldMapping
│   ├── run_demo.py          #   一键复跑双场景并导出 demo/*.json
│   └── test_engine.py       #   回归测试（5 项，锁精度优势/系数变号/接口契约）
├── backend/                 # ②空间服务层·FastAPI（29 个 py 文件）
│   └── app/
│       ├── api/v1/          #   auth/projects/datasets/models/spatial/reports 六组路由
│       ├── services/        #   坐标转换(WGS84↔GCJ-02)/字段映射器/入库/存储/GeoServer
│       ├── tasks/           #   Celery：cpu_queue 清洗入库 · gpu_queue 训练 · Redis 进度广播
│       └── models|schemas/  #   ORM（PostGIS geometry+JSONB）与 Pydantic 契约
├── frontend/                # ①可视化分析层·Vue3 + TS + Pinia + Element Plus
│   └── src/
│       ├── views/           #   登录 / 项目列表 / 工作台（四步式流程）
│       ├── components/      #   UploadPanel → ModelingWizard → TrainingMonitor → ResultDashboard
│       └── composables/     #   useTrainingSocket（WS 主推+轮询兜底）、colormap 色标
├── demo/                    # 零依赖结果看板 + 引擎真实导出数据
├── deploy/postgres/init.sql # PostGIS 扩展 + 全部表结构 + GiST 空间索引
├── docker-compose.yml       # postgis/redis/minio/geoserver/api/worker×2/frontend 一键编排
└── scripts/build_dashboard.py  # 把 run_demo 导出的数据内联进看板模板
```

## 快速上手

### A. 只看引擎与看板（零依赖，本仓库即开即用）

```bash
python3 -m engine.test_engine        # 5 项回归测试
python3 -m engine.run_demo           # 复跑双场景，重新导出 demo/*.json
python3 -m scripts.build_dashboard   # 重建 demo/GNNWR平台_结果看板.html
```

引擎仅依赖 numpy（pandas 用于数据框）。

### B. 全栈一键部署（Docker）

```bash
cp .env.example .env                 # 生产务必改 SECRET_KEY 与各密码
docker compose up -d --build
# 前端  http://localhost:5173   （首个注册用户即可用；含独立看板 /dashboard.html）
# API   http://localhost:8000/docs
# MinIO http://localhost:9001   GeoServer http://localhost:8080/geoserver
```

一期建议先只起 `postgis redis api worker-cpu worker-gpu frontend` 跑通闭环。

### C. 本地开发

```bash
# 后端（需本机 PostGIS+Redis，或 docker compose up postgis redis）
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload                # API
celery -A app.tasks.celery_app.celery_app worker -Q cpu_queue,gpu_queue -l info

# 前端
cd frontend && npm install && npm run dev    # Vite 代理 /api → :8000
```

## 端到端流程（对应大纲第八章时序图）

登录 → 新建项目（选场景）→ **数据接入**（拖拽 CSV/Excel/GeoJSON，后端自动识别经纬度/时间/Y 候选列并统一坐标系入库 PostGIS）→ **建模向导**（字段映射器 + GNNWR/GTNNWR 切换 + 隐藏层/学习率/早停等超参）→ **训练监控**（Celery 异步训练，逐 epoch loss 经 Redis→WebSocket 实时推送，轮询兜底）→ **结果看板**（逐点系数地图 + 时间轴动画 + 残差诊断 + OLS/GWR/GTWR/RF 精度对比 + PDF 报告导出）。

## 地图底图：双引擎设计（高德 / 离线画布）

结果看板的系数地图组件 `frontend/src/components/CoefficientMap.vue` 内置两套渲染引擎，**按配置自动选择，代码零改动**：

| | 高德底图（AMap JS API 2.0） | 离线 Canvas 画布 |
|---|---|---|
| 启用条件 | 配置了 `VITE_AMAP_KEY` 且脚本加载成功 | 未配 key / 加载失败 / 内网离线（自动降级） |
| 效果 | 暗色街道底图 + 可平移缩放，CircleMarker 逐点着色 | 经纬度网格 + 逐点着色（与独立看板同款） |
| 坐标处理 | 显示前 WGS84→GCJ-02 纠偏（`composables/gcj02.ts`，否则全图偏移 100~700m） | 直接使用 WGS84 |
| 适用 | 演示 / 生产 / 汇报给非 GIS 背景的人 | 评审离线环境、无外网服务器 |

**启用真实底图三步**：

1. 到 https://lbs.amap.com/dev/key/app 免费申请「Web端 (JS API)」类型 key（会同时得到配套安全密钥）；
2. 本地开发：复制 `frontend/.env.example` 为 `frontend/.env`，填入 `VITE_AMAP_KEY` / `VITE_AMAP_SECURITY`，`npm run dev` 即生效；
3. Docker 部署：在根目录 `.env` 填 `AMAP_KEY` / `AMAP_SECURITY`，然后 `docker compose build frontend && docker compose up -d`（Vite 变量在**构建期**烘焙，改 key 后必须重新 build）。

当前引擎显示在看板工具栏徽标上（`◉ 高德底图` / `◌ 离线画布`），降级不弹错、不阻断流程。

## 关于引擎的两点说明

1. **gnnwr_lite 与真实 `gnnwr` 包的关系**：为保证离线环境可完整跑通闭环，平台内置了纯 numpy 的 `gnnwr_lite`，其数学本质与原方法一致——回归系数是空间/时空坐标的神经网络函数 `ŷ = Σ βₖ(s,t)·xₖ`。生产部署时在 `backend/requirements.txt` 启用 `gnnwr + torch`，并在 `app/tasks/training.py` 中把 `run_analysis` 替换为对导师团队开源包（github.com/zjuwss/gnnwr）的调用即可，接口契约已由 `test_v1_contract_shape` 测试锁定。
2. **演示数据**：`engine/data.py` 生成带**已知非平稳真值**的合成数据（系数场设计为跨空间变号），因此能客观验证"模型是否复现了非平稳性"。接入 RESDC / 环境监测总站 / 住建网签等真实数据时，仅需替换上传文件，下游全部组件（含看板）无需改动。

## 验收自检清单

- [x] `python3 -m engine.test_engine` 5/5 通过（含 GNNWR>OLS、GTNNWR>GWR、系数变号、v1 契约）
- [x] 后端 29 个 Python 文件 `py_compile` 全部通过；路由与前端 API 客户端逐一对齐（含 `/coefficients` 与训练 WebSocket）
- [x] 前端全部 `@/` 导入可解析；四步工作台组件齐备；外部依赖与 `package.json` 逐一对账
- [x] 地图双引擎：高德底图（GCJ-02 纠偏 + 暗色样式 + fitView + hover 提示）与离线 Canvas 自动降级，Element Plus 暗色主题（`html.dark` + dark css-vars）已接通
- [x] 看板两个 `<script>` 块 Node 语法校验通过，双场景数据完整（340 点 / 1260 点×14 天）

## 参考文献

Du et al., 2020 (IJGIS, GNNWR)；Wu et al., 2021 (IJGIS, GTNNWR)；Chen et al., 2021 (RS, PM2.5 场景)；Liu et al., 2023 (RS, NO₂ 场景)；Wang et al., 2022 (IJGI, 深圳房价)；Ding et al., 2024 (IJGIS, 武汉房价)；`gnnwr` 开源包：https://github.com/zjuwss/gnnwr
