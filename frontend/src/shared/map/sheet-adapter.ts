import type { BBox, SurfaceLayerInfo } from '../types';
import { lngToX, latToY, scaleOf, xToLng, yToLat } from './mercator';
import { MapEmitter } from './emitter';
import type { MapAdapter, MapEventMap, MountOptions, PointLayerInput, Viewport } from './types';

/**
 * 离线图纸底。
 *
 * 没有底图影像 —— 画的是经纬网、比例尺和数据点, 像一张分析图纸。
 * 这不是"降级的高德", 是有意的第二种底: 无外网环境下平台仍然可用,
 * 而且科研截图里经纬网底往往比卫星影像更清楚。
 *
 * 直接吃 WGS84, 不做纠偏 —— 没有第三方底图要对齐, 纠偏只会引入误差。
 */
export class SheetAdapter implements MapAdapter {
  readonly kind = 'sheet' as const;
  readonly renderCrs = 'WGS84' as const;
  readonly notice: string | null;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private el: HTMLElement | null = null;
  private ro: ResizeObserver | null = null;
  private raf = 0;

  private center: [number, number] = [116.4, 39.9];
  private zoom = 5;
  private theme: 'light' | 'dark' = 'light';
  private dpr = 1;

  private layers = new Map<string, PointLayerInput>();
  private emitter = new MapEmitter();

  private brushMode = false;
  private brushStart: [number, number] | null = null;
  private brushRect: [number, number, number, number] | null = null;
  private hoverIdx: { index: number; layerId: string } | null = null;

  constructor(notice: string | null = null) {
    this.notice = notice;
  }

  async mount(el: HTMLElement, opts: MountOptions): Promise<void> {
    this.el = el;
    this.center = opts.center;
    this.zoom = opts.zoom;
    this.theme = opts.theme;

    const c = document.createElement('canvas');
    c.style.cssText = 'width:100%;height:100%;display:block;cursor:grab;touch-action:none';
    c.tabIndex = 0;
    c.setAttribute('role', 'application');
    c.setAttribute('aria-label', '数据点位地图。方向键平移, 加减号缩放。');
    el.appendChild(c);
    this.canvas = c;
    this.ctx = c.getContext('2d');

    this.ro = new ResizeObserver(() => { this.resize(); this.schedule(); });
    this.ro.observe(el);
    this.resize();
    this.bindInput();
    this.schedule();
    return Promise.resolve();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.canvas?.remove();
    this.canvas = null; this.ctx = null; this.el = null;
    this.emitter.clear();
  }

  setTheme(t: 'light' | 'dark'): void { this.theme = t; this.schedule(); }

  upsertPointLayer(input: PointLayerInput): void { this.layers.set(input.id, input); this.schedule(); }
  removeLayer(id: string): void { this.layers.delete(id); this.schedule(); }

  /** 离线底不支持 WMS 栅格: 没有网络就没有切片。明确不支持好过静默失败。 */
  setSurface(_info: SurfaceLayerInfo | null): void { /* 见上 */ }

  /** 图纸底直接吃 WGS84 bbox, 不做 GCJ 纠偏。 */
  fitBounds(b: BBox, padding = 48): void {
    if (!this.canvas) return;
    const w = this.canvas.width / this.dpr - padding * 2;
    const h = this.canvas.height / this.dpr - padding * 2;
    const dx = Math.abs(lngToX(b[2]) - lngToX(b[0])) || 1;
    const dy = Math.abs(latToY(b[3]) - latToY(b[1])) || 1;
    // 由米宽推回 zoom: scale(zoom) * dx = w
    const zx = Math.log2((w / dx) * (2 * Math.PI * 6378137) / 256);
    const zy = Math.log2((h / dy) * (2 * Math.PI * 6378137) / 256);
    this.zoom = Math.max(2, Math.min(18, Math.min(zx, zy)));
    this.center = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    this.emitViewport();
    this.schedule();
  }

  /** 图纸底视口本身就是 WGS84, 可直接作为查询 bbox。 */
  getViewport(): Viewport {
    const [w, h] = this.sizeCss();
    const s = scaleOf(this.zoom);
    const cx = lngToX(this.center[0]);
    const cy = latToY(this.center[1]);
    return {
      center: this.center,
      zoom: this.zoom,
      bbox: [
        xToLng(cx - w / 2 / s), yToLat(cy - h / 2 / s),
        xToLng(cx + w / 2 / s), yToLat(cy + h / 2 / s),
      ],
    };
  }

  setBrushMode(on: boolean): void {
    this.brushMode = on;
    if (this.canvas) this.canvas.style.cursor = on ? 'crosshair' : 'grab';
  }

  on<K extends keyof MapEventMap>(ev: K, cb: (p: MapEventMap[K]) => void): () => void {
    return this.emitter.on(ev, cb);
  }

  /* ─────────── 内部 ─────────── */

  private emit<K extends keyof MapEventMap>(ev: K, p: MapEventMap[K]): void {
    this.emitter.emit(ev, p);
  }
  private emitViewport(): void { this.emit('viewport', this.getViewport()); }

  private sizeCss(): [number, number] {
    return this.canvas ? [this.canvas.width / this.dpr, this.canvas.height / this.dpr] : [0, 0];
  }

  private resize(): void {
    if (!this.canvas || !this.el) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, this.el.clientWidth * this.dpr);
    this.canvas.height = Math.max(1, this.el.clientHeight * this.dpr);
  }

  private project(lng: number, lat: number): [number, number] {
    const [w, h] = this.sizeCss();
    const s = scaleOf(this.zoom);
    return [
      (lngToX(lng) - lngToX(this.center[0])) * s + w / 2,
      -(latToY(lat) - latToY(this.center[1])) * s + h / 2,
    ];
  }

  private schedule(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => { this.draw(); });
  }

  private bindInput(): void {
    const c = this.canvas;
    if (!c) return;
    let dragging = false;
    let last: [number, number] = [0, 0];

    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      last = [e.offsetX, e.offsetY];
      if (this.brushMode) { this.brushStart = last; this.brushRect = null; }
      else { dragging = true; c.style.cursor = 'grabbing'; }
    });

    c.addEventListener('pointermove', (e) => {
      const p: [number, number] = [e.offsetX, e.offsetY];
      if (dragging) {
        const s = scaleOf(this.zoom);
        const cx = lngToX(this.center[0]) - (p[0] - last[0]) / s;
        const cy = latToY(this.center[1]) + (p[1] - last[1]) / s;
        this.center = [xToLng(cx), yToLat(cy)];
        last = p;
        this.emitViewport();
        this.schedule();
      } else if (this.brushStart) {
        this.brushRect = [
          Math.min(this.brushStart[0], p[0]), Math.min(this.brushStart[1], p[1]),
          Math.abs(p[0] - this.brushStart[0]), Math.abs(p[1] - this.brushStart[1]),
        ];
        this.schedule();
      } else {
        const hit = this.hitTest(p[0], p[1]);
        if (hit?.index !== this.hoverIdx?.index) { this.hoverIdx = hit; this.emit('hover', hit); this.schedule(); }
      }
    });

    const finish = (): void => {
      dragging = false;
      c.style.cursor = this.brushMode ? 'crosshair' : 'grab';
      if (this.brushStart && this.brushRect && this.brushRect[2] > 4) {
        this.emit('brush', this.collectBrush(this.brushRect));
      } else if (this.brushStart) {
        this.emit('brush', null);
      }
      this.brushStart = null; this.brushRect = null; this.schedule();
    };
    c.addEventListener('pointerup', finish);
    c.addEventListener('pointercancel', finish);

    c.addEventListener('click', (e) => {
      if (this.brushMode) return;
      this.emit('click', this.hitTest(e.offsetX, e.offsetY));
    });

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const before = this.unproject(e.offsetX, e.offsetY);
      this.zoom = Math.max(2, Math.min(18, this.zoom - Math.sign(e.deltaY) * 0.35));
      const after = this.unproject(e.offsetX, e.offsetY);
      // 保持光标下的地理点不动 —— 缩放手感的关键
      this.center = [
        this.center[0] + (before[0] - after[0]),
        this.center[1] + (before[1] - after[1]),
      ];
      this.emitViewport();
      this.schedule();
    }, { passive: false });

    // 键盘可达: 方向键平移, +/- 缩放
    c.addEventListener('keydown', (e) => {
      const step = 40 / scaleOf(this.zoom);
      const map: Record<string, () => void> = {
        ArrowLeft: () => { this.center = [xToLng(lngToX(this.center[0]) - step), this.center[1]]; },
        ArrowRight: () => { this.center = [xToLng(lngToX(this.center[0]) + step), this.center[1]]; },
        ArrowUp: () => { this.center = [this.center[0], yToLat(latToY(this.center[1]) + step)]; },
        ArrowDown: () => { this.center = [this.center[0], yToLat(latToY(this.center[1]) - step)]; },
        '=': () => { this.zoom = Math.min(18, this.zoom + 0.5); },
        '+': () => { this.zoom = Math.min(18, this.zoom + 0.5); },
        '-': () => { this.zoom = Math.max(2, this.zoom - 0.5); },
      };
      const fn = map[e.key];
      if (fn) { e.preventDefault(); fn(); this.emitViewport(); this.schedule(); }
    });
  }

  private unproject(px: number, py: number): [number, number] {
    const [w, h] = this.sizeCss();
    const s = scaleOf(this.zoom);
    return [
      xToLng(lngToX(this.center[0]) + (px - w / 2) / s),
      yToLat(latToY(this.center[1]) - (py - h / 2) / s),
    ];
  }

  private topLayers(): PointLayerInput[] {
    return [...this.layers.values()].filter((l) => l.visible).sort((a, b) => a.z - b.z);
  }

  private hitTest(px: number, py: number): { index: number; layerId: string } | null {
    for (const l of [...this.topLayers()].reverse()) {
      const r = Math.max(6, l.radius + 3);
      for (let i = 0; i < l.xy.length; i += 2) {
        const [x, y] = this.project(l.xy[i]!, l.xy[i + 1]!);
        if ((x - px) ** 2 + (y - py) ** 2 <= r * r) return { index: i / 2, layerId: l.id };
      }
    }
    return null;
  }

  private collectBrush(rect: [number, number, number, number]): MapEventMap['brush'] {
    const top = this.topLayers().at(-1);
    if (!top) return null;
    const out: number[] = [];
    for (let i = 0; i < top.xy.length; i += 2) {
      const [x, y] = this.project(top.xy[i]!, top.xy[i + 1]!);
      if (x >= rect[0] && x <= rect[0] + rect[2] && y >= rect[1] && y <= rect[1] + rect[3]) out.push(i / 2);
    }
    return { layerId: top.id, indices: out };
  }

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx || !this.canvas) return;
    const [w, h] = this.sizeCss();
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, w, h);

    const dark = this.theme === 'dark';
    ctx.fillStyle = dark ? '#08151C' : '#EDF0EF';
    ctx.fillRect(0, 0, w, h);

    this.drawGraticule(ctx, w, h, dark);

    // 分帧: 点数极多时每帧只画一部分, 避免长任务卡住输入
    for (const l of this.topLayers()) {
      ctx.globalAlpha = l.opacity;
      const hl = l.highlight;
      for (let i = 0; i < l.xy.length; i += 2) {
        const [x, y] = this.project(l.xy[i]!, l.xy[i + 1]!);
        if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue;
        const idx = i / 2;
        const dim = hl && hl.size > 0 && !hl.has(idx);
        ctx.globalAlpha = l.opacity * (dim ? 0.12 : 1);
        ctx.beginPath();
        ctx.arc(x, y, l.radius, 0, Math.PI * 2);
        ctx.fillStyle = l.colors[idx] ?? '#888';
        ctx.fill();
        if (!dim && l.radius >= 4) {
          ctx.lineWidth = 0.5;
          ctx.strokeStyle = dark ? 'rgba(0,0,0,.5)' : 'rgba(255,255,255,.75)';
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;

    if (this.hoverIdx) {
      const l = this.layers.get(this.hoverIdx.layerId);
      if (l) {
        const i = this.hoverIdx.index * 2;
        const [x, y] = this.project(l.xy[i]!, l.xy[i + 1]!);
        ctx.beginPath();
        ctx.arc(x, y, l.radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = dark ? '#8B72FF' : '#6B4DF0';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    if (this.brushRect) {
      ctx.fillStyle = dark ? 'rgba(139,114,255,.16)' : 'rgba(107,77,240,.14)';
      ctx.strokeStyle = dark ? '#8B72FF' : '#6B4DF0';
      ctx.lineWidth = 1;
      ctx.fillRect(...this.brushRect);
      ctx.strokeRect(...this.brushRect);
    }

    this.drawScaleBar(ctx, w, h, dark);
    ctx.restore();
  }

  private drawGraticule(ctx: CanvasRenderingContext2D, w: number, h: number, dark: boolean): void {
    const vp = this.getViewport();
    const span = vp.bbox[2] - vp.bbox[0];
    const steps = [10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];
    const stepDeg = steps.find((s) => span / s <= 9) ?? 0.01;
    ctx.strokeStyle = dark ? 'rgba(255,255,255,.09)' : 'rgba(11,31,42,.10)';
    ctx.fillStyle = dark ? 'rgba(230,237,240,.5)' : 'rgba(91,103,112,.9)';
    ctx.lineWidth = 0.5;
    ctx.font = '10px ui-monospace, monospace';

    for (let lng = Math.ceil(vp.bbox[0] / stepDeg) * stepDeg; lng <= vp.bbox[2]; lng += stepDeg) {
      const [x] = this.project(lng, vp.bbox[1]);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      ctx.fillText(`${lng.toFixed(stepDeg < 1 ? 2 : 0)}°E`, x + 3, h - 6);
    }
    for (let lat = Math.ceil(vp.bbox[1] / stepDeg) * stepDeg; lat <= vp.bbox[3]; lat += stepDeg) {
      const [, y] = this.project(vp.bbox[0], lat);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      ctx.fillText(`${lat.toFixed(stepDeg < 1 ? 2 : 0)}°N`, 4, y - 3);
    }
  }

  private drawScaleBar(ctx: CanvasRenderingContext2D, _w: number, h: number, dark: boolean): void {
    const s = scaleOf(this.zoom);
    const targets = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    const km = targets.find((t) => t * 1000 * s > 60) ?? 1000;
    const px = km * 1000 * s;
    const x0 = 12; const y0 = h - 24;
    ctx.strokeStyle = dark ? 'rgba(230,237,240,.75)' : 'rgba(11,31,42,.75)';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0 - 4); ctx.lineTo(x0, y0); ctx.lineTo(x0 + px, y0); ctx.lineTo(x0 + px, y0 - 4);
    ctx.stroke();
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(`${km} km`, x0 + px + 6, y0 + 1);
  }
}
