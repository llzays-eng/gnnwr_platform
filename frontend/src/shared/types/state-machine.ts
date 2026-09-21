import type { DatasetStatus } from './dataset';
import type { TaskStatus } from './model';

/**
 * 状态机的合法转移表。
 *
 * 放在类型层而不是散在组件里, 是为了让「界面把状态改成了后端不可能给出的值」
 * 这类 bug 在开发期就被 assertTransition 抓到。
 */
export const DATASET_TRANSITIONS: Readonly<Record<DatasetStatus, readonly DatasetStatus[]>> =
  Object.freeze({
    uploaded: ['cleaning', 'failed'],
    cleaning: ['cleaned', 'failed'],
    cleaned: ['ingested', 'cleaning', 'failed'],
    ingested: [],
    failed: ['uploaded', 'cleaning'],
  });

export const TASK_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = Object.freeze({
  PENDING: ['RUNNING', 'FAILED'],
  RUNNING: ['SUCCESS', 'FAILED'],
  SUCCESS: [],
  FAILED: [],
});

export const isTerminalTask = (s: TaskStatus): boolean => TASK_TRANSITIONS[s].length === 0;

export function canTransition<S extends string>(
  table: Readonly<Record<S, readonly S[]>>,
  from: S,
  to: S,
): boolean {
  return table[from].includes(to);
}
