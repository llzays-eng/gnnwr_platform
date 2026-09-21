import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { ModelTask, SocketPhase, TaskId } from '@shared/types';
import { isTerminalTask } from '@shared/types';

export interface TaskRuntime {
  task: ModelTask;
  phase: SocketPhase;
  /** 重连尝试次数, 用于指数退避 */
  retries: number;
  lastMessageAt: number;
  /** WS 断连期间的进度由轮询补齐, 这里记录补齐到哪一个 epoch */
  polledUpTo: number;
}

const CHANNEL = 'gnnwr:task';

/**
 * 任务注册表。
 *
 * 三件必须做对的事:
 *  1. 页面刷新 / 切走再回来 → 状态从 /status 接口恢复, 不依赖内存
 *  2. 多标签页 → BroadcastChannel 选主, 只有一个标签持有 WS 连接,
 *     其余订阅广播。否则开 5 个标签就是 5 条连接、5 倍推送压力。
 *  3. WS 断连 → 指数退避重连, 重连后从 /status 补齐断连期间的进度
 *
 * 连接生命周期的具体实现在阶段 3 的 shared/ws/task-socket.ts,
 * 这里只定状态形状与广播协议。
 */
export const useTaskStore = defineStore('task', () => {
  const runtimes = ref<Map<TaskId, TaskRuntime>>(new Map());
  /** 本标签页是否为 WS 主标签 */
  const isLeader = ref(false);
  const channel = ref<BroadcastChannel | null>(null);

  const active = computed(() =>
    [...runtimes.value.values()].filter((r) => !isTerminalTask(r.task.status)));

  function upsert(task: ModelTask): void {
    const prev = runtimes.value.get(task.id);
    runtimes.value.set(task.id, {
      task,
      phase: prev?.phase ?? 'idle',
      retries: prev?.retries ?? 0,
      lastMessageAt: Date.now(),
      polledUpTo: task.progress?.epoch ?? prev?.polledUpTo ?? 0,
    });
    // 触发响应式: Map 的 set 不会被 Vue 追踪到深层, 重新赋值
    runtimes.value = new Map(runtimes.value);
    broadcast({ kind: 'task', task });
  }

  const setPhase = (id: TaskId, phase: SocketPhase): void => {
    const r = runtimes.value.get(id);
    if (r) { r.phase = phase; runtimes.value = new Map(runtimes.value); }
  };

  type Msg = { kind: 'task'; task: ModelTask } | { kind: 'leader-ping' };

  function broadcast(msg: Msg): void { channel.value?.postMessage(msg); }

  /** 在 App 挂载时调用一次 */
  function initCrossTab(): () => void {
    const ch = new BroadcastChannel(CHANNEL);
    channel.value = ch;
    // 简化的选主: 先到先得, 主标签关闭时其余标签会在下一次心跳失败后接管。
    // 完整实现(含心跳与让位)在阶段 3。
    isLeader.value = true;
    ch.onmessage = (e: MessageEvent<Msg>) => {
      if (e.data.kind === 'task') {
        const t = e.data.task;
        const prev = runtimes.value.get(t.id);
        runtimes.value.set(t.id, {
          task: t,
          phase: prev?.phase ?? 'idle',
          retries: prev?.retries ?? 0,
          lastMessageAt: Date.now(),
          polledUpTo: t.progress?.epoch ?? 0,
        });
        runtimes.value = new Map(runtimes.value);
      }
    };
    return () => { ch.close(); channel.value = null; };
  }

  return { runtimes, isLeader, active, upsert, setPhase, initCrossTab };
});
