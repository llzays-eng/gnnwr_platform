import { describe, expect, it } from 'vitest';
import type { FieldSchema, WizardDraft } from '@shared/types';
import { canSubmit, stepBlocked, validate } from '../validation';

const f = (name: string, kind: FieldSchema['kind'], stats: FieldSchema['stats'] = null, missing = 0): FieldSchema => ({
  name, kind, missing_count: 0, missing_ratio: missing, distinct_count: 10, sample_values: [], stats,
});

const st = (min: number, max: number) => ({ min, max, mean: (min + max) / 2, std: 1, q25: min, q50: (min + max) / 2, q75: max });

const SCHEMA: FieldSchema[] = [
  f('pm25', 'numeric', st(3, 180)),
  f('aod', 'numeric', st(0.02, 1.4)),
  f('t2m', 'numeric', st(15, 40)),
  f('lon', 'numeric', st(118.5, 122.5)),
  f('lat', 'numeric', st(29.5, 32.8)),
  f('date', 'datetime'),
  f('station_id', 'text'),
  f('sparse', 'numeric', st(0, 1), 0.5),
];

const base = (over: Partial<WizardDraft> = {}): WizardDraft => ({
  model_type: 'GNNWR', y_column: 'pm25', x_columns: ['aod', 't2m'],
  longitude_column: 'lon', latitude_column: 'lat', temporal_column: null,
  split: { train: 0.7, val: 0.15, test: 0.15 },
  network: { hidden_layers: [64, 32], activation: 'relu', dropout: 0.1 },
  training: { batch_size: 256, max_epochs: 500, learning_rate: 0.001, early_stopping_patience: 30 },
  random_seed: 42,
  ...over,
});

describe('建模配置校验', () => {
  it('合法配置无错误', () => {
    expect(canSubmit(validate(base(), SCHEMA))).toBe(true);
  });

  it('Y 出现在 X 中要报错，且指名到列', () => {
    const issues = validate(base({ x_columns: ['pm25', 'aod'] }), SCHEMA);
    const hit = issues.find((i) => i.message.includes('pm25') && i.severity === 'error');
    expect(hit).toBeTruthy();
    expect(hit!.fixes.length).toBeGreaterThanOrEqual(2);
  });

  it('X 为空要报错', () => {
    expect(stepBlocked(validate(base({ x_columns: [] }), SCHEMA), 2)).toBe(true);
  });

  it('文本列不能当自变量', () => {
    const issues = validate(base({ x_columns: ['station_id'] }), SCHEMA);
    expect(issues.some((i) => i.field === 'station_id' && i.severity === 'error')).toBe(true);
  });

  it('GTNNWR 缺时间列要报错，并给出改用 GNNWR 的出路', () => {
    const issues = validate(base({ model_type: 'GTNNWR' }), SCHEMA);
    const hit = issues.find((i) => i.message.includes('必须指定时间列'));
    expect(hit).toBeTruthy();
    expect(hit!.fixes.some((x) => x.includes('GNNWR'))).toBe(true);
  });

  it('GNNWR 带时间列要报错', () => {
    const issues = validate(base({ temporal_column: 'date' }), SCHEMA);
    expect(issues.some((i) => i.message.includes('不接受时间列'))).toBe(true);
  });

  it('坐标列超出合理区间要报错', () => {
    const bad = [...SCHEMA, f('badlon', 'numeric', st(-500, 500))];
    const issues = validate(base({ longitude_column: 'badlon' }), bad);
    expect(issues.some((i) => i.field === 'badlon' && i.severity === 'error')).toBe(true);
  });

  it('经纬度选成同一列要报错', () => {
    expect(validate(base({ latitude_column: 'lon' }), SCHEMA)
      .some((i) => i.message.includes('同一列'))).toBe(true);
  });

  it('高缺失率只警告，不阻塞提交', () => {
    const issues = validate(base({ x_columns: ['aod', 'sparse'] }), SCHEMA);
    expect(issues.some((i) => i.field === 'sparse' && i.severity === 'warning')).toBe(true);
    expect(canSubmit(issues)).toBe(true);
  });

  it('划分三段之和不为 1 要报错', () => {
    expect(canSubmit(validate(base({ split: { train: 0.7, val: 0.2, test: 0.2 } }), SCHEMA))).toBe(false);
  });

  it('每条错误都必须给出至少一条出路', () => {
    const issues = validate(base({ model_type: null, y_column: null, x_columns: [] }), SCHEMA);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.fixes.length >= 1)).toBe(true);
  });
});
