import { defineStore } from 'pinia';
import { computed, ref, watchEffect } from 'vue';

export type ThemeMode = 'light' | 'dark' | 'auto';

const THEME_KEY = 'gnnwr:theme';

export const useUiStore = defineStore('ui', () => {
  const mode = ref<ThemeMode>((localStorage.getItem(THEME_KEY) as ThemeMode | null) ?? 'auto');
  const systemDark = ref(matchMedia('(prefers-color-scheme: dark)').matches);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => { systemDark.value = e.matches; });

  const resolved = computed<'light' | 'dark'>(() =>
    mode.value === 'auto' ? (systemDark.value ? 'dark' : 'light') : mode.value);

  watchEffect(() => {
    document.documentElement.dataset['theme'] = resolved.value;
    localStorage.setItem(THEME_KEY, mode.value);
  });

  /** prefers-reduced-motion 是硬性质量底线, 不是可选项 */
  const reducedMotion = ref(matchMedia('(prefers-reduced-motion: reduce)').matches);
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => { reducedMotion.value = e.matches; });

  /** 看板浮层的开合。⌘\ 一键全收进入纯图态。 */
  const panels = ref<Record<string, boolean>>({ layers: true, legend: true, ribbon: true, metrics: true });
  const togglePanel = (k: string) => { panels.value[k] = !panels.value[k]; };
  const setAllPanels = (open: boolean) => {
    Object.keys(panels.value).forEach((k) => { panels.value[k] = open; });
  };

  return { mode, resolved, reducedMotion, panels, togglePanel, setAllPanels };
});
