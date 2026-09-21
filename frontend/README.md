# GNNWR 时空智能分析云平台 · 前端

把 GNNWR / GTNNWR 从「需要写 Python 才能跑的模型」变成「上传数据 → 点选参数 → 看地图动画」的云端建模工具。

**当前进度：阶段 1–4 完成。** 五大功能模块均可运行，Mock 下可完整走通「上传 → 配置 → 训练 → 解读 → 出报告」。阶段 5（性能验证与交接文档）见文末。

---

## 快速开始

```bash
pnpm install
pnpm msw:init            # 生成 public/mockServiceWorker.js，只需执行一次
cp .env.example .env.local
# 填入 VITE_AMAP_KEY 与 VITE_AMAP_SECURITY_CODE
pnpm dev
```

默认 `VITE_ENABLE_MOCK=true`，前端可独立跑通全流程。演示账号 `demo / demo`，管理员 `admin / admin`，也可以游客身份直接浏览两个演示项目。

**没有高德 Key 也能看到地图。** 未配置 `VITE_AMAP_KEY` 时会自动落到「离线图纸底」——经纬网 + 比例尺 + 数据点的纯 canvas 渲染，支持平移缩放、悬停、点击、框选与键盘操作。这不是降级的高德，是有意的第二种底：无外网环境下平台仍然可用，且科研截图里经纬网底往往比卫星影像更清楚。界面左上角会说明当前用的是哪一种底。

两个演示项目各预置了一个已完成的训练任务，所以点进项目、点阶段轨第 4 步「解读」，可以直接看到系数图层、系数带、精度对比与残差分布。

### 联调基线（必读）

- **正确基线**：`gnnwr_platform_frontend` × `llzays-eng/gnnwr_platform_backend`（PR #1 及后续）。
- **不要对接** monorepo `gnnwr_platform` 里的旧 backend：会出现 CRS 语义不一致、接口缺失等系统性偏差。
- 推荐联调配置：

```bash
VITE_ENABLE_MOCK=false
VITE_MOCK_ASSUME_PENDING_CONTRACTS=false
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_WS_BASE_URL=ws://127.0.0.1:8000
```

### 联调前必做

```bash
# 真联调前务必关闭 Mock 与 pending 假定
VITE_ENABLE_MOCK=false VITE_MOCK_ASSUME_PENDING_CONTRACTS=false pnpm dev
```

若仍有页面报「接口尚未提供」，先检查是否误连了 monorepo 旧 backend，再核对 `docs/接口协商清单.md` 中剩余 PENDING 项。

### Mock WebSocket 调试

浏览器控制台：

```js
__mockWs.drop()        // 立刻断开，验证指数退避重连
__mockWs.silence(8000) // 静默 8 秒，验证 REST 轮询兜底接管
__mockWs.noCoef = true // 停发 coef_summary，验证系数带演进栏的优雅降级
```

---

## 目录结构

按**功能域**组织，不按文件类型平铺。

```
src/
├── app/                     应用装配层
│   ├── router/              routes(即信息架构) / guards(角色守卫)
│   └── boot/                error-boundary / query(vue-query 配置)
│
├── shared/                  公共能力
│   ├── types/               ★ 唯一契约真相。改这里，Mock 夹具会立刻编译报错
│   │   ├── brand.ts         品牌 ID：把 datasetId 传进要 projectId 的位置 = 编译错误
│   │   ├── auth/project/dataset/spatial/model/result/ws/api
│   │   └── state-machine.ts 数据集与任务的合法转移表
│   ├── geo/                 ★ 坐标系纪律
│   │   ├── crs.ts           Coord<'WGS84'> 品牌类型 + CoordBuffer 批量路径
│   │   ├── transform.ts     全项目唯一允许写变换数学的文件（ESLint 锁死）
│   │   └── bbox.ts
│   ├── map/                 ★ 地图内核
│   │   ├── types.ts         MapAdapter 接口，renderCrs 由适配器自己声明
│   │   ├── amap-adapter.ts  高德 2.0 + Loca 分帧渲染 + WMS 曲面
│   │   ├── sheet-adapter.ts 离线图纸底（经纬网 + canvas 点渲染 + 框选）
│   │   └── index.ts         工厂：无 Key / 加载失败自动回退，并显式告知
│   ├── viz/                 classify(等间隔/分位数/自然断点) / stats(指标方向归一化)
│   ├── ws/task-socket.ts    双通道：常驻轮询 + WS + 假死看门狗 + 指数退避
│   ├── workers/             要素解析 Worker（返回 TypedArray，Transferable）
│   ├── api/                 endpoints(FROZEN/PENDING) / http / error-map / 各域 api
│   ├── styles/              tokens.css / element-bridge.css / data-color.ts
│   ├── config/env.ts        环境变量唯一读取入口 + 启动自检
│   ├── utils/               logger / format / single-flight
│   └── components/
│
├── stores/                  Pinia：只放「用户决定的东西」
│   ├── auth  project  dataset  modeling  task
│   └── layer  timeline  selection  ui      ← 看板共享内核
│
├── modules/                 功能域
│   ├── dataset/             地图优先预览、离岸哨兵、列识别、上传（分片探测回落）
│   ├── modeling/            六步向导；validation.ts 是纯函数规则引擎，可单测
│   ├── monitor/             训练监控；BetaRibbon.vue 是平台记忆点
│   ├── dashboard/           四类视图 + 联动；useCoefficientField 隔离分页不确定性
│   └── project/             项目 CRUD、阶段轨外壳、报告与版本对比
│
└── mocks/                   MSW
    ├── handlers/            与真实接口一一对应
    ├── fixtures/            两个业务场景的仿真数据（真的埋了空间非平稳结构）
    ├── ws-handlers.ts       WebSocket Mock + 断线/静默/降级开关
    └── vitest-setup.ts      与浏览器共用同一套 handler
```

---

## 三条必须遵守的纪律

### 1. 坐标系

渲染层只接受 `Coord<'GCJ02'>`，传 WGS84 是**编译错误**而不是一张偏移 500 米的地图。

```ts
import { coordFromGeoJson, toRenderCRS } from '@shared/geo';

const wgs = coordFromGeoJson(feature.geom.coordinates); // Coord<'WGS84'>
addPoints([toRenderCRS('WGS84', wgs)]);                 // 少这一步就编译不过
```

三道防线：编译期品牌类型 → 构建期 ESLint 锁死 `transform.ts` 的引用 → 运行期 `assertCrs` 与离岸哨兵。

批量数据（>1 万点）走 `CoordBuffer` + `Float64Array`，不要用品牌元组数组。

### 2. 数据色只能从一个地方来

色带、图例、系数带的颜色一律取自 `shared/styles/data-color.ts`。用 Uno 原子类或组件内 hex 写数据色，是图例与地图失同步的头号原因。

界面交互色 `--c-signal`（电紫）**永不进入地图画布与图例**——否则用户无法判断一块紫色是「可以点」还是「数值高」。

### 3. 场景类型不许影响解析逻辑

`scenario_type` 只允许影响默认值与文案。任何 `if (scenario === 'air_quality') props.pm25` 都是错的，请从字段映射配置里取列名。

---

## 高德 Key 安全配置

**开发环境**：`.env.local` 填 `VITE_AMAP_SECURITY_CODE`，代码里通过 `window._AMapSecurityConfig` 注入。

**生产环境**：安全密钥**不能**下发到浏览器。两步：

1. 控制台给 Key 绑定安全域名白名单（只填正式域名，不要填 `*`）
2. 安全密钥改用代理方案：由后端网关代理高德服务请求，前端配置
   `window._AMapSecurityConfig = { serviceHost: 'https://你的域名/_AMapService' }`，
   网关在转发时附加 `jscode`

Vite 的 `VITE_` 变量会被打进产物，因此**生产构建绝不能**把安全密钥写进 `.env.production`。

---

## 五大模块的落点

| 模块 | 入口 | 关键实现 |
|---|---|---|
| 数据接入 | `/p/:id/data` | 地图占主区域、表格默认收起；离岸哨兵检测坐标系错配与经纬度写反并给一键修复；分片上传默认走冻结接口，接错旧后端时回落单次并告警 |
| 建模向导 | `/p/:id/model` | 六步、随时回退不丢配置（草稿按项目持久化）；字段映射器零场景判断；校验精确到列、每条至少两条出路 |
| 训练监控 | `/p/:id/runs/:taskId` | 轮询常驻而非仅断线启用——WS 最恶劣的失败是「连着但不推了」，靠 onclose 永远发现不了；20s 无消息主动断开重连；重连后立刻补齐进度 |
| 可视化看板 | `/p/:id/explore/:taskId` | 逐点系数图层是一等公民；图例与地图共用同一份 breaks；雷达图先做指标方向归一化；地图刷选 ↔ 图表过滤只经过 selection store |
| 项目与报告 | `/projects`、`/p/:id/reports` | 项目 CRUD、多任务指标并排、PDF 异步导出 + 状态跟踪 |

## 测试

```bash
pnpm test
```

覆盖提示词点名的三处核心逻辑：坐标转换（含往返误差、离岸哨兵、经纬度写反识别）、字段映射校验（11 条）、时间轴状态机（7 条）。

端到端主流程的测试思路：Playwright 起 Mock 环境 → 登录 → 建项目 → 上传夹具 CSV → 断言地图出现点位 → 走完六步向导 → 断言任务进入 RUNNING → 等待 SUCCESS → 进入看板断言系数图层有色带 → 切换分级方式断言图例与地图同步变化。其中「图例与地图同步」是最值得端到端保障的一条，因为它跨越了 store、色带模块与两个组件。

## 阶段 1–4 遗留 TODO

- [ ] `pnpm msw:init` 生成的 `public/mockServiceWorker.js` 未纳入仓库，首次 clone 需手动执行
- [ ] 字体文件未落地：思源黑体 SC 全字重约 20MB，需子集化后放 `public/fonts/`
- [ ] `.husky/` 钩子脚本需 `pnpm prepare` 后手动写入 `pre-commit`（lint-staged）与 `commit-msg`（commitlint）
- [ ] `MapAdapter` 接口只在文档里定义，代码待阶段 3
- [ ] vue-query 与 Pinia 的边界目前靠约定，考虑加 ESLint 规则禁止在 store 里 import api
- [x] ~~`useCoefficientField()` 抽象层~~ 已落地，含分页能力运行时探测与降级
- [ ] 高德适配器的框选（需 MouseTool 插件），当前仅图纸底支持框选
- [ ] 图纸底暂不支持 WMS 曲面（无网络即无切片），曲面图层只在高德底下可用
- [ ] 10 万点性能预算尚未实测：Mock 夹具最大 3900 点，需要更大的数据集才能验证
- [ ] 自然断点用的是 k-means 近似而非完整 Jenks，视觉等价但需在交接文档里写明

## 需与后端确认

见 `docs/接口协商清单.md`。当前主要剩余为配置模板（#6）与报告异步 job（#7）；曲面 TIME 仍按「点层可动画、曲面暂不支持」处理。

## 后续阶段

| 阶段 | 内容 |
|---|---|
| 2 | 数据接入与预览 + 建模向导（字段映射器与全部校验） |
| 3 | 训练监控（WS + 轮询兜底 + 重连）+ 地图内核封装 |
| 4 | 多维可视化看板四类视图 + 联动 + 项目与报告管理 |
| 5 | 性能优化落地、测试用例、交接文档 |
