import { onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue';
import { TaskSocket } from '@shared/ws/task-socket';
import type { CoefficientSummary, ModelTask, SocketPhase, TaskId } from '@shared/types';
import { useAuthStore, useTaskStore } from '@stores/index';

/**
 * 把 TaskSocket 接到组件生命周期上。
 *
 * 跨标签页: 只有主标签(task store 的 isLeader)真的建 WS 连接,
 * 其余标签靠 BroadcastChannel 收广播。否则开 5 个标签 = 5 条连接。
 */
export function useTaskSocket(taskId: Ref<TaskId | null>) {
  const auth = useAuthStore();
  const tasks = useTaskStore();

  const task = shallowRef<ModelTask | null>(null);
  const phase = ref<SocketPhase>('idle');
  const coefSummary = shallowRef<readonly CoefficientSummary[] | null>(null);
  /** 后端是否真的推了系数摘要。没有就把整栏降级, 不留空白框。 */
  const coefSupported = ref(false);
  const logs = ref<{ at: number; level: string; message: string }[]>([]);

  let sock: TaskSocket | null = null;

  function stop(): void { sock?.stop(); sock = null; }

  function start(id: TaskId): void {
    stop();
    logs.value = [];
    coefSupported.value = false;
    sock = new TaskSocket(id, () => auth.token, {
      onTask: (t) => { task.value = t; tasks.upsert(t); },
      onCoefSummary: (s) => { coefSummary.value = s; coefSupported.value = true; },
      onPhase: (p) => { phase.value = p; tasks.setPhase(id, p); },
      onLog: (l) => { logs.value = [...logs.value.slice(-199), l]; },
    });
    sock.start();
  }

  watch(taskId, (id) => { if (id) start(id); else stop(); }, { immediate: true });
  onBeforeUnmount(stop);

  return { task, phase, coefSummary, coefSupported, logs };
}
