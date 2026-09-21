import type { FieldSchema, WizardDraft } from '@shared/types';

/**
 * 建模配置校验规则引擎。
 *
 * 刻意做成【纯函数】而不是绑在 Element Plus 表单上, 有两个原因:
 *  1. 阶段 5 要为它写单元测试, 绑在组件上就测不了
 *  2. 导入"配置模板"时要能离开 UI 单独跑一遍
 *
 * 文案纪律: 每条失败都要指名到列、说明原因、给出【至少两条】出路。
 * "参数不合法"这种没有出路的文案不允许出现。
 */

export type Severity = 'error' | 'warning';

export interface Issue {
  severity: Severity;
  /** 归属步骤, 用于让步骤条标红并支持点击跳转 */
  step: 1 | 2 | 3 | 4 | 5;
  /** 涉及的字段名, 用于在字段列表里高亮 */
  field: string | null;
  message: string;
  fixes: string[];
}

const LNG_RANGE: [number, number] = [-180, 180];
const LAT_RANGE: [number, number] = [-90, 90];
const CHINA_LNG: [number, number] = [73, 136];
const CHINA_LAT: [number, number] = [3, 54];

function numericIssue(f: FieldSchema | undefined, name: string, role: string, step: 1 | 2): Issue[] {
  if (!f) return [{ severity: 'error', step, field: name, message: `${role} ${name} 不在数据集中。`, fixes: ['重新选择一列', '确认上传的是同一份数据'] }];
  if (f.kind !== 'numeric' && f.kind !== 'integer') {
    return [{ severity: 'error', step, field: name, message: `${role} ${name} 是${f.kind === 'datetime' ? '时间' : '文本'}类型，不能参与回归。`, fixes: ['换一个数值型字段', '若确为数值，回到数据接入重新指定该列类型'] }];
  }
  return [];
}

export function validate(draft: WizardDraft, schema: readonly FieldSchema[]): Issue[] {
  const out: Issue[] = [];
  const byName = new Map(schema.map((f) => [f.name, f]));

  /* 步骤 1 · 模型类型 */
  if (!draft.model_type) {
    out.push({ severity: 'error', step: 1, field: null, message: '尚未选择模型类型。', fixes: ['数据有时间维度选 GTNNWR', '只有空间位置选 GNNWR'] });
  }

  /* 步骤 2 · 字段映射 */
  if (!draft.y_column) {
    out.push({ severity: 'error', step: 2, field: null, message: '尚未指定目标变量 Y。', fixes: ['选择你要预测或解释的那个数值列', '例如实测浓度、成交单价'] });
  } else {
    out.push(...numericIssue(byName.get(draft.y_column), draft.y_column, '目标变量', 2));
  }

  if (draft.x_columns.length === 0) {
    out.push({ severity: 'error', step: 2, field: null, message: '至少需要一个自变量 X。', fixes: ['从左侧字段列表勾选影响因素', '也可以点「推荐配置」自动填充'] });
  }
  for (const x of draft.x_columns) {
    out.push(...numericIssue(byName.get(x), x, '自变量', 2));
  }

  if (draft.y_column && draft.x_columns.includes(draft.y_column)) {
    out.push({ severity: 'error', step: 2, field: draft.y_column, message: `${draft.y_column} 同时是目标变量和自变量，模型会用答案预测答案。`, fixes: [`把 ${draft.y_column} 从自变量中移除`, '或改选另一列作为目标变量'] });
  }

  /* 坐标列 */
  const checkCoord = (col: string | null, role: '经度' | '纬度', range: [number, number], china: [number, number]): void => {
    if (!col) {
      out.push({ severity: 'error', step: 2, field: null, message: `尚未指定${role}列。`, fixes: ['从字段列表中选择', '若数据无坐标，本平台无法建模'] });
      return;
    }
    const f = byName.get(col);
    out.push(...numericIssue(f, col, `${role}列`, 2));
    if (!f?.stats) return;
    if (f.stats.min < range[0] || f.stats.max > range[1]) {
      out.push({ severity: 'error', step: 2, field: col, message: `${col} 的取值 ${f.stats.min.toFixed(2)} ~ ${f.stats.max.toFixed(2)} 超出${role}合理区间 ${range[0]}~${range[1]}。`, fixes: ['确认经纬度两列是否写反', '确认该列是否为投影坐标（需先转为经纬度）'] });
    } else if (f.stats.min < china[0] || f.stats.max > china[1]) {
      out.push({ severity: 'warning', step: 2, field: col, message: `${col} 有取值落在中国境外。若数据本就跨境可忽略。`, fixes: ['检查坐标系选择', '检查是否混入了异常行'] });
    }
  };
  checkCoord(draft.longitude_column, '经度', LNG_RANGE, CHINA_LNG);
  checkCoord(draft.latitude_column, '纬度', LAT_RANGE, CHINA_LAT);

  if (draft.longitude_column && draft.longitude_column === draft.latitude_column) {
    out.push({ severity: 'error', step: 2, field: draft.longitude_column, message: '经度列与纬度列选成了同一列。', fixes: ['为纬度另选一列'] });
  }

  /* 时间列与模型类型的互斥关系 */
  if (draft.model_type === 'GTNNWR' && !draft.temporal_column) {
    out.push({ severity: 'error', step: 2, field: null, message: 'GTNNWR 是时空模式，必须指定时间列。', fixes: ['指定一个可解析为日期的列', '若数据没有时间维度，回到步骤 1 改用 GNNWR'] });
  }
  if (draft.model_type === 'GNNWR' && draft.temporal_column) {
    out.push({ severity: 'error', step: 2, field: draft.temporal_column, message: 'GNNWR 是纯空间模式，不接受时间列。', fixes: ['清空时间列', '或回到步骤 1 改用 GTNNWR 以利用时间信息'] });
  }

  /* 缺失值提醒: 不阻塞, 但要说 */
  for (const x of draft.x_columns) {
    const f = byName.get(x);
    if (f && f.missing_ratio > 0.3) {
      out.push({ severity: 'warning', step: 2, field: x, message: `${x} 有 ${Math.round(f.missing_ratio * 100)}% 缺失，会显著削弱它的解释力。`, fixes: ['考虑移除该变量', '或在数据接入阶段先做插值'] });
    }
  }

  /* 步骤 3 · 划分 */
  const sum = draft.split.train + draft.split.val + draft.split.test;
  if (Math.abs(sum - 1) > 1e-6) {
    out.push({ severity: 'error', step: 3, field: null, message: `训练/验证/测试三段之和为 ${sum.toFixed(3)}，必须等于 1。`, fixes: ['拖动任一滑块，其余两段会自动吸收差值'] });
  }
  if (draft.split.val < 0.05) {
    out.push({ severity: 'warning', step: 3, field: null, message: '验证集不足 5%，早停会失去意义。', fixes: ['把验证集调到 10% 以上'] });
  }

  /* 步骤 4 · 网络结构 */
  if (draft.network.hidden_layers.length === 0) {
    out.push({ severity: 'error', step: 4, field: null, message: '至少需要一个隐藏层。', fixes: ['点「推荐配置」填入 64/32/16'] });
  }
  if (draft.network.hidden_layers.some((n) => n < 1 || !Number.isInteger(n))) {
    out.push({ severity: 'error', step: 4, field: null, message: '每层神经元数必须是正整数。', fixes: ['常用取值为 16 到 256'] });
  }
  if (draft.network.dropout < 0 || draft.network.dropout >= 1) {
    out.push({ severity: 'error', step: 4, field: null, message: 'Dropout 必须在 0 到 1 之间（不含 1）。', fixes: ['推荐 0.1'] });
  }

  /* 步骤 5 · 训练超参 */
  if (draft.training.max_epochs < 1) {
    out.push({ severity: 'error', step: 5, field: null, message: '最大轮数必须大于 0。', fixes: ['推荐 500'] });
  }
  if (draft.training.learning_rate <= 0 || draft.training.learning_rate > 1) {
    out.push({ severity: 'error', step: 5, field: null, message: '学习率必须大于 0 且不超过 1。', fixes: ['推荐 0.001'] });
  }
  if (draft.training.early_stopping_patience >= draft.training.max_epochs) {
    out.push({ severity: 'warning', step: 5, field: null, message: '早停耐心值不小于最大轮数，早停不会触发。', fixes: ['把耐心值调到最大轮数的 5%~10%'] });
  }

  return out;
}

export const errorsOf = (issues: Issue[]): Issue[] => issues.filter((i) => i.severity === 'error');
export const stepBlocked = (issues: Issue[], step: number): boolean =>
  issues.some((i) => i.severity === 'error' && i.step === step);
export const canSubmit = (issues: Issue[]): boolean => errorsOf(issues).length === 0;
