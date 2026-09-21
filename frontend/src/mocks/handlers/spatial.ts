import { http } from 'msw';
import { FROZEN } from '@shared/api/endpoints';
import type { SurfaceLayerInfo, TilesResponse } from '@shared/types';
import { asIso } from '@shared/types';
import { db, scenarios } from '../db';
import { fail, lag, ok, parseBBox } from './_util';

export const spatialHandlers = [
  http.get(FROZEN.tiles, async ({ request }) => {
    await lag(80, 260);
    const url = new URL(request.url);
    const dsId = url.searchParams.get('dataset_id');
    const bbox = parseBBox(url.searchParams.get('bbox'));
    const limit = Number(url.searchParams.get('limit') ?? 5000);
    const tStart = Number(url.searchParams.get('time_start') ?? NaN);
    const tEnd = Number(url.searchParams.get('time_end') ?? NaN);
    const cursor = Number(url.searchParams.get('cursor') ?? 0);

    const ds = db.datasets.find((d) => d.id === dsId);
    if (!ds) return fail(404, '数据集不存在。');
    const sc = Object.values(scenarios).find((s) => s.dataset.filename === ds.filename)
      ?? Object.values(scenarios)[0]!;

    let feats = sc.features;
    if (bbox) {
      feats = feats.filter((f) => {
        const [x, y] = f.geom.coordinates;
        return x >= bbox[0] && x <= bbox[2] && y >= bbox[1] && y <= bbox[3];
      });
    }
    if (Number.isFinite(tStart) && Number.isFinite(tEnd)) {
      feats = feats.filter((f) => {
        if (!f.observed_time) return true;
        const t = Date.parse(f.observed_time);
        return t >= tStart && t <= tEnd;
      });
    }

    const page = feats.slice(cursor, cursor + limit);
    const res: TilesResponse = {
      features: page,
      crs: 'WGS84', // ★ 后端一律 WGS84。前端渲染前必须过 toRenderCRS()
      next_cursor: cursor + limit < feats.length ? String(cursor + limit) : null,
      total: feats.length,
    };
    return ok(res);
  }),

  http.get(FROZEN.surface(':id'), async ({ params }) => {
    await lag();
    const info: SurfaceLayerInfo = {
      task_id: String(params['id']),
      service: 'WMS',
      base_url: 'http://127.0.0.1:8080/geoserver/gnnwr/wms',
      layer_name: 'gnnwr:pm25_surface',
      tile_crs: 'GCJ02',
      bbox: [118.5, 29.5, 122.5, 32.8],
      time_dimension: Array.from({ length: 30 }, (_, i) =>
        asIso(new Date(Date.UTC(2023, 6, 1 + i)).toISOString())),
      wms_time_supported: false,
      legend_url: null,
      note: 'Mock 对齐联调后端: 自渲染曲面 tile_crs=GCJ02; WMS TIME 未实现, 时间轴只驱动点层。',
    };
    return ok(info);
  }),
];
