import { http } from 'msw';
import { FROZEN } from '@shared/api/endpoints';
import type { ModelTask, Paginated, TaskId, TrainRequest } from '@shared/types';
import { asId, asIso } from '@shared/types';
import type { ProjectId } from '@shared/types';
import { db, scenarios } from '../db';
import { coefSummariesOf } from '../fixtures/scenarios';
import { comparison, modelResult } from '../fixtures/factory';
import { fail, lag, ok, parseBBox } from './_util';

const scenarioOf = (pid: string) => scenarios[asId<ProjectId>(pid)] ?? Object.values(scenarios)[0]!;

export const modelHandlers = [
  http.post(FROZEN.train, async ({ request }) => {
    await lag(300, 800);
    const body = (await request.json()) as TrainRequest;

    // 服务端也校验一遍 —— 前端校验是体验, 后端校验是正确性。
    // Mock 保留这些分支, 才能演示「后端拒绝」时的界面。
    if (!body.y_column) return fail(422, '未指定目标变量 Y。');
    if (!body.x_columns?.length) return fail(422, '至少需要一个自变量 X。');
    if (body.x_columns.includes(body.y_column)) {
      return fail(422, `目标变量 ${body.y_column} 不能同时作为自变量。请从 X 中移除它。`);
    }
    if (body.model_type === 'GTNNWR' && !body.temporal_column) {
      return fail(422, 'GTNNWR 为时空模式, 必须指定时间列。若数据无时间维度, 请改用 GNNWR。');
    }
    if (body.model_type === 'GNNWR' && body.temporal_column) {
      return fail(422, 'GNNWR 为纯空间模式, 不接受时间列。');
    }

    const task: ModelTask = {
      id: asId<TaskId>(db.nextId('t')),
      project_id: body.project_id,
      dataset_id: body.dataset_id,
      model_type: body.model_type,
      y_column: body.y_column,
      x_columns: body.x_columns,
      spatial_columns: body.spatial_columns,
      temporal_column: body.temporal_column,
      hyperparams: body.hyperparams,
      status: 'PENDING',
      progress: null,
      error: null,
      created_at: asIso(new Date().toISOString()),
      started_at: null,
      finished_at: null,
    };
    // 45 秒跑完, 足够演示进度、断线重连与刷新恢复, 又不至于等到不耐烦
    db.addTask(task, 45_000);
    return ok(task);
  }),

  http.get(FROZEN.taskStatus(':id'), async ({ params }) => {
    await lag(60, 160);
    const t = db.taskSnapshot(asId<TaskId>(String(params['id'])));
    return t ? ok(t) : fail(404, '任务不存在。可能已被清理或 ID 有误。');
  }),

  http.get(FROZEN.taskResult(':id'), async ({ params }) => {
    await lag(200, 500);
    const id = asId<TaskId>(String(params['id']));
    const t = db.taskSnapshot(id);
    if (!t) return fail(404, '任务不存在。');
    if (t.status !== 'SUCCESS') return fail(409, '任务尚未完成, 暂无结果。请等待训练结束。');

    const sc = scenarioOf(t.project_id);
    const coef = coefSummariesOf(sc.coefficients, [...t.x_columns]);
    const residuals = sc.coefficients.map((c) => c.residual);
    return ok(modelResult(id, { r2: 0.893, rmse: 6.21, mae: 4.37, aicc: 8421.6 },
      coef, residuals, sc.coefficients.length, t.hyperparams.max_epochs));
  }),

  http.get(FROZEN.taskCompare(':id'), async ({ params }) => {
    await lag(200, 500);
    const id = asId<TaskId>(String(params['id']));
    const t = db.taskSnapshot(id);
    if (!t) return fail(404, '任务不存在。');
    const sc = scenarioOf(t.project_id);
    const coef = coefSummariesOf(sc.coefficients, [...t.x_columns]);
    // 全局模型的"系数带"塌缩成一根线: 用 min=max=mean 表达
    const globalCoef = coef.map((c) => ({
      ...c, min: c.mean, max: c.mean, q05: c.mean, q25: c.mean,
      q50: c.mean, q75: c.mean, q95: c.mean, std: 0,
    }));
    return ok(comparison(id, t.model_type, { r2: 0.893, rmse: 6.21, mae: 4.37, aicc: 8421.6 }, coef, globalCoef));
  }),

  // 逐点系数 / 取消 / 日志 / 任务列表已解冻(协商清单 #3 #5 #9)
  http.get(FROZEN.coefficients(':id'), async ({ params, request }) => {
    await lag(150, 400);
    const t = db.taskSnapshot(asId<TaskId>(String(params['id'])));
    if (!t) return fail(404, '任务不存在。');
    const url = new URL(request.url);
    const bbox = parseBBox(url.searchParams.get('bbox'));
    const limit = Number(url.searchParams.get('limit') ?? 5000);
    const sc = scenarioOf(t.project_id);
    let pts = sc.coefficients;
    if (bbox) {
      pts = pts.filter((p) => {
        const [x, y] = p.geom.coordinates;
        return x >= bbox[0] && x <= bbox[2] && y >= bbox[1] && y <= bbox[3];
      });
    }
    return ok({ points: pts.slice(0, limit), next_cursor: pts.length > limit ? 'c1' : null });
  }),

  http.post(FROZEN.cancelTask(':id'), async ({ params }) => {
    db.tasks.delete(asId<TaskId>(String(params['id'])));
    return ok(null);
  }),

  http.get(FROZEN.taskLogs(':id'), async () =>
    ok({ lines: [
      { at: Date.now() - 30_000, level: 'info', message: '数据加载完成, 12483 条样本' },
      { at: Date.now() - 28_000, level: 'info', message: '空间权重网络初始化: [64, 32, 16]' },
      { at: Date.now() - 5_000, level: 'warn', message: 'aod 列存在 4% 缺失, 已按邻域均值填充' },
    ] })),

  http.get(FROZEN.listTasks, async ({ request }) => {
    const pid = new URL(request.url).searchParams.get('project_id');
    const items = [...db.tasks.keys()]
      .map((id) => db.taskSnapshot(id)!)
      .filter((t) => !pid || t.project_id === pid);
    const res: Paginated<ModelTask> = { items, total: items.length, page: 1, page_size: 50 };
    return ok(res);
  }),
];
