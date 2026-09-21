import { defineConfig, presetWind, presetIcons, transformerDirectives } from 'unocss';

/**
 * 注意 theme 里的颜色全部指向 CSS 变量而非硬编码 hex。
 * 这样深色模式切换只需换 data-theme, 不需要重新生成任何原子类。
 *
 * 硬规则: 这里只有界面色, 没有数据色。
 * 色带、图例、系数带的颜色一律来自 shared/styles/data-color.ts,
 * 用 Uno 原子类写数据色是图例与地图失同步的头号原因。
 */
export default defineConfig({
  presets: [
    presetWind(),
    presetIcons({ scale: 1.15, extraProperties: { display: 'inline-block', 'vertical-align': 'middle' } }),
  ],
  transformers: [transformerDirectives()],
  theme: {
    colors: {
      north: 'var(--c-north)',
      mylar: 'var(--c-mylar)',
      graphite: 'var(--c-graphite)',
      isoline: 'var(--c-isoline)',
      ochre: 'var(--c-ochre)',
      signal: 'var(--c-signal)',
      alarm: 'var(--c-alarm)',
      surface: 'var(--s-surface)',
      'surface-raised': 'var(--s-raised)',
      edge: 'var(--edge)',
      fg: 'var(--fg)',
      'fg-muted': 'var(--fg-muted)',
    },
    fontSize: {
      11: ['11px', '1.4'], 12: ['12px', '1.45'], 13: ['13px', '1.5'], 14: ['14px', '1.55'],
      16: ['16px', '1.5'], 20: ['20px', '1.35'], 25: ['25px', '1.25'],
      32: ['32px', '1.15'], 40: ['40px', '1.1'],
    },
    fontFamily: {
      display: 'var(--font-display)',
      body: 'var(--font-body)',
      data: 'var(--font-data)',
    },
    borderRadius: { xs: '2px', sm: '6px', panel: '12px' },
    boxShadow: { e1: 'var(--e1)', e2: 'var(--e2)', e3: 'var(--e3)' },
  },
  shortcuts: {
    // 蜡纸浮层: 地图之上的面板统一用这一个 shortcut, 保证发丝线与模糊一致
    // panel-mylar 的实体在 shared/styles/base.css —— backdrop-filter 需要带 -webkit- 前缀, 原子类给不了
    'text-eyebrow': 'font-display text-11 tracking-[0.14em] uppercase text-fg-muted',
    'num': 'font-data tabular-nums',
  },
});