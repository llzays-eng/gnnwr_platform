import type { Dataset, ModelTask, Project, TaskId, TaskStatus, UserProfile } from '@shared/types';
import { asId, asIso } from '@shared/types';
import type { ProjectId, UserId } from '@shared/types';
import { buildAirQuality, buildHousingPrice, type ScenarioData } from './fixtures/scenarios';

/**
 * Mock 的内存状态。
 * 有状态而非纯静态返回, 是因为要支持完整流程演示:
 * 建了项目能在列表里看到, 提交训练能真的看到进度往前跑, 刷新页面状态还在。
 */

export const DEMO_USER: UserProfile = {
  id: asId<UserId>('u_demo'),
  username: 'demo',
  display_name: '张明',
  role: 'user',
  created_at: asIso('2023-05-01T00:00:00Z'),
};

export const ADMIN_USER: UserProfile = {
  id: asId<UserId>('u_admin'),
  username: 'admin',
  display_name: '管理员',
  role: 'admin',
  created_at: asIso('2023-01-01T00:00:00Z'),
};

const P_AIR = asId<ProjectId>('p_air_yrd');
const P_HOUSE = asId<ProjectId>('p_house_sh');

export const scenarios: Record<ProjectId, ScenarioData> = {
  [P_AIR]: buildAirQuality(P_AIR),
  [P_HOUSE]: buildHousingPrice(P_HOUSE),
};

interface TaskRuntime {
  task: ModelTask;
  /** 用于让进度随真实时间推进, 而不是一提交就完成 */
  startedAtMs: number;
  durationMs: number;
}

class MockDb {
  projects: Project[] = [
    {
      id: P_AIR,
      name: '长三角 PM2.5 时空反演',
      description: '以卫星 AOD 与 ERA5 气象为协变量, 反演逐日空间连续 PM2.5 浓度场。',
      scenario_type: 'air_quality',
      owner_id: DEMO_USER.id,
      created_at: asIso('2023-08-02T09:00:00Z'),
      updated_at: asIso('2023-08-14T11:20:00Z'),
      is_demo: true,
    },
    {
      id: P_HOUSE,
      name: '上海二手房价格空间分异',
      description: '识别地铁可达性、楼龄、POI 密度对房价影响的空间异质性。',
      scenario_type: 'housing_price',
      owner_id: DEMO_USER.id,
      created_at: asIso('2023-11-20T02:00:00Z'),
      updated_at: asIso('2023-12-01T15:40:00Z'),
      is_demo: true,
    },
  ];

  datasets: Dataset[] = Object.values(scenarios).map((s) => s.dataset);

  tasks = new Map<TaskId, TaskRuntime>();

  seq = 0;

  nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${Date.now().toString(36)}${this.seq}`;
  }

  /**
   * 按真实时间推算任务状态。
   * 这样刷新页面、切走再回来、多标签页打开都能看到一致的进度 ——
   * 正是训练监控模块要验证的场景。
   */
  taskSnapshot(id: TaskId): ModelTask | undefined {
    const rt = this.tasks.get(id);
    if (!rt) return undefined;
    const elapsed = Date.now() - rt.startedAtMs;
    const ratio = Math.min(1, elapsed / rt.durationMs);
    const total = rt.task.hyperparams.max_epochs;
    const epoch = Math.max(1, Math.floor(total * ratio));

    let status: TaskStatus = 'RUNNING';
    if (elapsed < 1500) status = 'PENDING';
    else if (ratio >= 1) status = 'SUCCESS';

    const base = 0.9 * Math.exp(-epoch / (total * 0.28)) + 0.06;
    return {
      ...rt.task,
      status,
      progress: status === 'PENDING' ? null : {
        epoch, total_epochs: total,
        train_loss: Number(base.toFixed(5)),
        val_loss: Number((base * 1.08).toFixed(5)),
        elapsed_s: Math.round(elapsed / 1000),
        eta_s: ratio >= 1 ? 0 : Math.round(((rt.durationMs - elapsed) / 1000)),
      },
      started_at: asIso(new Date(rt.startedAtMs).toISOString()),
      finished_at: ratio >= 1 ? asIso(new Date(rt.startedAtMs + rt.durationMs).toISOString()) : null,
    };
  }

  addTask(task: ModelTask, durationMs = 45_000): void {
    this.tasks.set(task.id, { task, startedAtMs: Date.now(), durationMs });
  }
}

export const db = new MockDb();

/**
 * 给两个演示项目各预置一个【已完成】的任务。
 *
 * 没有它，用户新进项目时解读看板是空的 —— 必须先等 45 秒训练完
 * 才能看到平台的核心价值。演示环境里这是不可接受的。
 */
function seedCompletedTasks(): void {
  const base = Date.now() - 10 * 60_000;
  const defs: { id: string; pid: ProjectId; type: 'GNNWR' | 'GTNNWR' }[] = [
    { id: 't_demo_air', pid: P_AIR, type: 'GTNNWR' },
    { id: 't_demo_house', pid: P_HOUSE, type: 'GNNWR' },
  ];
  for (const d of defs) {
    const sc = scenarios[d.pid]!;
    const task: ModelTask = {
      id: asId<TaskId>(d.id),
      project_id: d.pid,
      dataset_id: sc.dataset.id,
      model_type: d.type,
      y_column: sc.yColumn,
      x_columns: sc.xColumns,
      spatial_columns: [sc.dataset.column_guess.longitude ?? 'lon', sc.dataset.column_guess.latitude ?? 'lat'],
      temporal_column: sc.temporalColumn,
      hyperparams: {
        hidden_layers: [64, 32, 16], activation: 'relu', dropout: 0.1,
        batch_size: 256, max_epochs: 500, learning_rate: 0.001,
        early_stopping_patience: 30,
        split: { train: 0.7, val: 0.15, test: 0.15 }, random_seed: 42,
      },
      status: 'SUCCESS',
      progress: null,
      error: null,
      created_at: asIso(new Date(base).toISOString()),
      started_at: asIso(new Date(base).toISOString()),
      finished_at: asIso(new Date(base + 300_000).toISOString()),
    };
    // durationMs 设为已过去的时长, taskSnapshot 会算出 ratio >= 1 即 SUCCESS
    db.tasks.set(task.id, { task, startedAtMs: base, durationMs: 300_000 });
  }
}
seedCompletedTasks();
export { P_AIR, P_HOUSE };
