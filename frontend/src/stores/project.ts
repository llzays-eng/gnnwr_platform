import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Project } from '@shared/types';

/**
 * 只放"当前上下文", 不放列表数据 ——
 * 列表是服务端状态, 归 vue-query 管。
 * 这条分工线一旦模糊, store 里就会长出一堆 loading/stale 逻辑。
 */
export const useProjectStore = defineStore('project', () => {
  const current = ref<Project | null>(null);
  const setCurrent = (p: Project | null): void => { current.value = p; };
  return { current, setCurrent };
});
