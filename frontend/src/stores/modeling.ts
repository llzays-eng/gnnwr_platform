import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type { ConfigTemplate, DatasetSplit, ProjectId, WizardDraft } from '@shared/types';

const DEFAULT_DRAFT = (): WizardDraft => ({
  model_type: null,
  y_column: null,
  x_columns: [],
  longitude_column: null,
  latitude_column: null,
  temporal_column: null,
  split: { train: 0.7, val: 0.15, test: 0.15 },
  // 推荐配置: 三层递减是 GNNWR 论文里常用的空间权重网络结构
  network: { hidden_layers: [64, 32, 16], activation: 'relu', dropout: 0.1 },
  training: { batch_size: 256, max_epochs: 500, learning_rate: 0.001, early_stopping_patience: 30 },
  random_seed: 42,
});

const draftKey = (pid: string) => `gnnwr:draft:${pid}`;
const TEMPLATE_KEY = 'gnnwr:templates';

export const useModelingStore = defineStore('modeling', () => {
  const projectId = ref<ProjectId | null>(null);
  const draft = ref<WizardDraft>(DEFAULT_DRAFT());
  const step = ref(1);

  /**
   * 草稿按项目持久化。
   * 「随时回退且不丢配置」这条要求, 光靠组件内状态是做不到的 ——
   * 用户刷新一次、切走一次就没了。
   */
  watch([draft, projectId], () => {
    if (projectId.value) localStorage.setItem(draftKey(projectId.value), JSON.stringify(draft.value));
  }, { deep: true });

  function bindProject(pid: ProjectId): void {
    projectId.value = pid;
    const raw = localStorage.getItem(draftKey(pid));
    draft.value = raw ? { ...DEFAULT_DRAFT(), ...(JSON.parse(raw) as Partial<WizardDraft>) } : DEFAULT_DRAFT();
  }

  const reset = (): void => { draft.value = DEFAULT_DRAFT(); step.value = 1; };

  /** 三段联动: 调一段, 其余两段按原比例吸收差值, 总和恒为 1 */
  function setSplit(part: keyof DatasetSplit, value: number): void {
    const s = { ...draft.value.split };
    const v = Math.max(0.05, Math.min(0.9, value));
    const others = (Object.keys(s) as (keyof DatasetSplit)[]).filter((k) => k !== part);
    const rest = 1 - v;
    const sumOthers = others.reduce((a, k) => a + s[k], 0) || 1;
    s[part] = v;
    others.forEach((k) => { s[k] = Number(((s[k] / sumOthers) * rest).toFixed(4)); });
    draft.value.split = s;
  }

  /* 配置模板: 后端无接口(协商清单 #6), 暂落 localStorage 并在界面标注「仅本机可见」 */
  const templates = ref<ConfigTemplate[]>(
    (() => { try { return JSON.parse(localStorage.getItem(TEMPLATE_KEY) ?? '[]') as ConfigTemplate[]; } catch { return []; } })(),
  );

  function saveTemplate(name: string): void {
    const { y_column: _y, x_columns: _x, longitude_column: _lo, latitude_column: _la, temporal_column: _t, ...rest } = draft.value;
    templates.value.unshift({
      id: crypto.randomUUID(),
      name,
      created_at: new Date().toISOString() as ConfigTemplate['created_at'],
      payload: rest,
    });
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates.value));
  }

  function applyTemplate(id: string): void {
    const t = templates.value.find((x) => x.id === id);
    // 只覆盖与数据集无关的部分, 字段映射保持不变 —— 换数据集也能复用模板
    if (t) draft.value = { ...draft.value, ...t.payload };
  }

  const layerCount = computed(() => draft.value.network.hidden_layers.length);

  return { projectId, draft, step, templates, layerCount,
    bindProject, reset, setSplit, saveTemplate, applyTemplate };
});
