import AMapLoader from '@amap/amap-jsapi-loader';
import type { BBox, SurfaceLayerInfo } from '../types';
import { env } from '../config/env';
import { coord, fitBBoxToRenderCrs, project, queryBBoxFromRenderViewport } from '../geo';
import { logger } from '../utils/logger';
import { MapEmitter } from './emitter';
import type { MapAdapter, MapEventMap, MountOptions, PointLayerInput, Viewport } from './types';

const log = logger.child('amap');

/* 高德与 Loca 没有官方 TS 类型包, 这里只声明我们实际用到的最小面。
   比 any 好: 用错方法名仍然会编译报错。 */
interface AMapMap {
  setMapStyle(s: string): void;
  getCenter(): { lng: number; lat: number };
  getZoom(): number;
  getBounds(): { getSouthWest(): { lng: number; lat: number }; getNorthEast(): { lng: number; lat: number } };
  setBounds(b: unknown, immediately?: boolean, avoid?: number[]): void;
  on(ev: string, cb: (e: unknown) => void): void;
  add(o: unknown): void;
  remove(o: unknown): void;
  destroy(): void;
}
interface LocaContainer { add(l: unknown): void; remove(l: unknown): void; destroy(): void; }
type AnyCtor = new (...args: never[]) => unknown;
interface AMapNS { Map: AnyCtor; Bounds: AnyCtor; TileLayer: { WMS: AnyCtor }; Loca?: unknown }

/**
 * 高德 JS API 2.0 + Loca 2.0 适配器。
 *
 * 说明: 这个文件在离线环境下无法验证 —— 它需要真实 Key 与外网。
 * 因此所有失败路径都做了显式处理, 且 MapStage 会在加载失败时
 * 自动落到 SheetAdapter, 而不是留一块白屏。
 *
 * 安全密钥必须走 window._AMapSecurityConfig, 这是高德 2.0 的硬性要求;
 * 生产环境应改用代理方案, 见 README「高德 Key 安全配置」。
 */
export class AmapAdapter implements MapAdapter {
  readonly kind = 'amap' as const;
  /** 高德底图是 GCJ-02。这个声明是坐标系纪律的一环, 上层据此转换。 */
  readonly renderCrs = 'GCJ02' as const;
  readonly notice = null;

  private map: AMapMap | null = null;
  private AMap: AMapNS | null = null;
  private loca: LocaContainer | null = null;
  private layerObjs = new Map<string, { layer: unknown; source: unknown }>();
  private wms: unknown = null;
  private emitter = new MapEmitter();
  private frameToken = 0;

  async mount(el: HTMLElement, opts: MountOptions): Promise<void> {
    if (!env.amapKey) throw new Error('未配置 VITE_AMAP_KEY');
    if (env.amapSecurityCode) {
      window._AMapSecurityConfig = { securityJsCode: env.amapSecurityCode };
    }

    const AMap = (await AMapLoader.load({
      key: env.amapKey,
      version: '2.0',
      plugins: ['AMap.Scale', 'AMap.ToolBar'],
      Loca: { version: '2.0.0' },
    })) as AMapNS;
    this.AMap = AMap;

    const MapCtor = AMap.Map as unknown as new (e: HTMLElement, o: unknown) => AMapMap;
    // MountOptions.center 是 WGS84; 高德底图要 GCJ-02, 与点图层同一条 project()。
    const gcj = project('WGS84', 'GCJ02', coord('WGS84', opts.center[0], opts.center[1]));
    this.map = new MapCtor(el, {
      zoom: opts.zoom,
      center: [gcj[0], gcj[1]],
      viewMode: '2D',
      mapStyle: opts.theme === 'dark' ? 'amap://styles/darkblue' : 'amap://styles/whitesmoke',
    });

    const LocaNS = (window as unknown as { Loca?: { Container: new (o: unknown) => LocaContainer } }).Loca;
    if (LocaNS) this.loca = new LocaNS.Container({ map: this.map });
    else log.warn('Loca 未加载, 大数据量图层会退化为普通标记');

    this.map.on('moveend', () => { this.emit('viewport', this.getViewport()); });
    this.map.on('zoomend', () => { this.emit('viewport', this.getViewport()); });
  }

  destroy(): void {
    this.loca?.destroy();
    this.map?.destroy();
    this.map = null; this.loca = null;
    this.layerObjs.clear();
    this.emitter.clear();
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.map?.setMapStyle(theme === 'dark' ? 'amap://styles/darkblue' : 'amap://styles/whitesmoke');
  }

  /**
   * Loca 分帧写入。
   *
   * 一次性 setSource 十万点会在主线程上产生数百毫秒的长任务, 手感直接崩。
   * 这里按块提交, 每块之间让出一帧; frameToken 用于让新的一次调用
   * 立刻作废上一次未完成的分帧循环(视野快速变化时非常关键)。
   */
  upsertPointLayer(input: PointLayerInput): void {
    if (!this.loca) return;
    const token = ++this.frameToken;
    const LocaNS = (window as unknown as {
      Loca: { PointLayer: new (o: unknown) => unknown; GeoJSONSource: new (o: unknown) => unknown };
    }).Loca;

    const features: unknown[] = [];
    const CHUNK = 20_000;

    const buildChunk = (start: number): void => {
      if (token !== this.frameToken) return;
      const end = Math.min(input.xy.length, start + CHUNK * 2);
      for (let i = start; i < end; i += 2) {
        features.push({
          type: 'Feature',
          properties: { c: input.colors[i / 2] ?? '#888', i: i / 2 },
          geometry: { type: 'Point', coordinates: [input.xy[i], input.xy[i + 1]] },
        });
      }
      if (end < input.xy.length) { requestAnimationFrame(() => { buildChunk(end); }); return; }

      const source = new LocaNS.GeoJSONSource({ data: { type: 'FeatureCollection', features } });
      const prev = this.layerObjs.get(input.id);
      if (prev) this.loca?.remove(prev.layer);

      const layer = new LocaNS.PointLayer({ zIndex: input.z, opacity: input.opacity, blend: 'normal' }) as {
        setSource(s: unknown): void;
        setStyle(s: unknown): void;
      };
      layer.setSource(source);
      layer.setStyle({
        radius: input.radius,
        color: (_i: number, f: { properties: { c: string } }) => f.properties.c,
        borderWidth: input.radius >= 4 ? 0.5 : 0,
        borderColor: 'rgba(255,255,255,0.7)',
      });
      this.loca?.add(layer);
      this.layerObjs.set(input.id, { layer, source });
    };

    if (input.visible) buildChunk(0);
    else { const prev = this.layerObjs.get(input.id); if (prev) this.loca.remove(prev.layer); }
  }

  removeLayer(id: string): void {
    const o = this.layerObjs.get(id);
    if (o) { this.loca?.remove(o.layer); this.layerObjs.delete(id); }
  }

  /**
   * WMS 曲面图层。
   *
   * ⚠ 若 info.tile_crs 不是 GCJ02, 这里贴上去会有 300~600m 系统性偏移,
   * 且栅格【无法】逐点纠偏。MapStage 会据此显示警告条。
   * 处置路线见 docs/风险-栅格偏移.md。
   */
  setSurface(info: SurfaceLayerInfo | null, opts: { opacity: number; visible: boolean; time?: string | null } = { opacity: 0.6, visible: true }): void {
    if (!this.map || !this.AMap) return;
    if (this.wms) { this.map.remove(this.wms); this.wms = null; }
    if (!info || !opts.visible) return;

    const WmsCtor = this.AMap.TileLayer.WMS as unknown as new (o: unknown) => unknown;
    // 后端自渲染曲面 wms_time_supported=false; 误传 TIME 不会切帧, 只会让人以为场在动。
    const timeParam = info.wms_time_supported && opts.time ? { TIME: opts.time } : {};
    this.wms = new WmsCtor({
      url: info.base_url,
      blend: false,
      opacity: opts.opacity,
      params: {
        LAYERS: info.layer_name,
        VERSION: '1.3.0',
        FORMAT: 'image/png',
        TRANSPARENT: true,
        ...timeParam,
      },
    });
    this.map.add(this.wms);
  }

  fitBounds(b: BBox, padding = 48): void {
    if (!this.map || !this.AMap) return;
    // BBox 契约是 WGS84; 高德 setBounds 要 GCJ-02。
    const gcj = fitBBoxToRenderCrs(this.renderCrs, b);
    const BoundsCtor = this.AMap.Bounds as unknown as new (a: number[], b: number[]) => unknown;
    this.map.setBounds(new BoundsCtor([gcj[0], gcj[1]], [gcj[2], gcj[3]]), true, [padding, padding, padding, padding]);
  }

  getViewport(): Viewport {
    if (!this.map) return { center: [116.4, 39.9], zoom: 5, bbox: [72, 0.8, 137.9, 55.9] };
    const c = this.map.getCenter();
    const b = this.map.getBounds();
    const sw = b.getSouthWest(); const ne = b.getNorthEast();
    // 高德视口是 GCJ-02。出站一律反投影成 WGS84, 查询 tiles/coefficients 时不必再带 bbox_crs。
    const wgsCenter = project('GCJ02', 'WGS84', coord('GCJ02', c.lng, c.lat));
    const wgsBBox = queryBBoxFromRenderViewport(this.renderCrs, [sw.lng, sw.lat, ne.lng, ne.lat]);
    return { center: [wgsCenter[0], wgsCenter[1]], zoom: this.map.getZoom(), bbox: wgsBBox };
  }

  /** Loca 的框选需要 MouseTool 插件, 阶段 5 补。当前刷选仅图纸底支持。 */
  setBrushMode(_on: boolean): void { /* TODO(阶段 5) */ }

  on<K extends keyof MapEventMap>(ev: K, cb: (p: MapEventMap[K]) => void): () => void {
    return this.emitter.on(ev, cb);
  }

  private emit<K extends keyof MapEventMap>(ev: K, p: MapEventMap[K]): void {
    this.emitter.emit(ev, p);
  }
}
