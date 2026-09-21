import type {
  ColumnGuess, CoefficientPoint, Dataset, FieldSchema, SpatialFeature,
} from '@shared/types';
import { asId, asIso } from '@shared/types';
import type { DatasetId, FeatureId, ProjectId } from '@shared/types';
import { between, gaussian, mulberry32 } from './rng';
import { fieldSchema, summarize } from './factory';

/**
 * 两个业务场景的仿真数据。
 *
 * 设计要点: 数据里【真的】埋了空间非平稳结构 ——
 * 大气场景让 AOD 系数在沿海与内陆反向, 房价场景让地铁距离的影响
 * 在近郊为负(越远越便宜)、在核心区趋近于零(反正都能走到)。
 * 只有这样, 系数带、时空动画和「非平稳性」这个卖点在演示时才不是假的。
 */

export interface ScenarioData {
  dataset: Dataset;
  features: SpatialFeature[];
  coefficients: CoefficientPoint[];
  xColumns: string[];
  yColumn: string;
  temporalColumn: string | null;
}

/* ───────────── 场景一: 长三角 PM2.5 时空反演 ───────────── */

const YRD_STATIONS = 130;
const YRD_DAYS = 30;
const YRD_START = Date.UTC(2023, 6, 1);

export function buildAirQuality(projectId: ProjectId): ScenarioData {
  const rnd = mulberry32(20230701);
  const dsId = asId<DatasetId>('ds_air_yrd');
  const features: SpatialFeature[] = [];
  const coefficients: CoefficientPoint[] = [];

  // 站点分布: 长三角, 经度 118.5~122.5, 纬度 29.5~32.8
  const stations = Array.from({ length: YRD_STATIONS }, (_, i) => ({
    id: i,
    lng: between(rnd, 118.5, 122.5),
    lat: between(rnd, 29.5, 32.8),
  }));

  const aodBetas: number[] = [];
  const t2mBetas: number[] = [];
  const blhBetas: number[] = [];
  const popBetas: number[] = [];

  for (const st of stations) {
    // 到海岸线的粗略距离(以经度 122 为岸线代理)
    const coastal = Math.max(0, 122.2 - st.lng) / 3.7; // 0=沿海, 1=内陆

    // ★ 空间非平稳: AOD 对 PM2.5 的贡献在内陆强、沿海弱甚至反号
    const bAod = -0.15 + coastal * 1.05 + gaussian(rnd, 0, 0.08);
    const bT2m = -0.42 + coastal * 0.25 + gaussian(rnd, 0, 0.06);
    const bBlh = -0.31 - coastal * 0.18 + gaussian(rnd, 0, 0.05);
    const bPop = 0.18 + (1 - coastal) * 0.34 + gaussian(rnd, 0, 0.07);
    aodBetas.push(bAod); t2mBetas.push(bT2m); blhBetas.push(bBlh); popBetas.push(bPop);

    for (let d = 0; d < YRD_DAYS; d++) {
      const t = YRD_START + d * 86_400_000;
      // 季节内的周期性 + 一次污染过程
      const episode = d > 11 && d < 17 ? 22 : 0;
      const aod = Math.max(0.02, 0.45 + 0.2 * Math.sin(d / 4.2) + gaussian(rnd, 0, 0.09) + episode / 90);
      const t2m = 28 + 4 * Math.sin(d / 5) + gaussian(rnd, 0, 1.6);
      const blh = Math.max(120, 850 + 260 * Math.sin(d / 3.6) + gaussian(rnd, 0, 90) - episode * 8);
      const dem = Math.max(1, 40 + coastal * 260 + gaussian(rnd, 0, 25));
      const pop = Math.max(50, 4200 * (1 - coastal * 0.55) + gaussian(rnd, 0, 500));

      const pm25 = Math.max(
        3,
        18 + bAod * 40 * aod + bT2m * 0.8 * (t2m - 28) + bBlh * 0.02 * (blh - 850) / 10 +
          bPop * pop / 900 + episode + gaussian(rnd, 0, 4.2),
      );

      features.push({
        id: asId<FeatureId>(`f_air_${st.id}_${d}`),
        dataset_id: dsId,
        geom: { type: 'Point', coordinates: [st.lng, st.lat] },
        observed_time: asIso(new Date(t).toISOString()),
        properties: {
          station_id: `YRD${String(st.id).padStart(3, '0')}`,
          pm25: Number(pm25.toFixed(1)),
          aod: Number(aod.toFixed(3)),
          t2m: Number(t2m.toFixed(2)),
          blh: Number(blh.toFixed(0)),
          dem: Number(dem.toFixed(0)),
          pop_density: Number(pop.toFixed(0)),
        },
      });

      if (d === 0) {
        const predicted = pm25 + gaussian(rnd, 0, 2.1);
        coefficients.push({
          feature_id: asId<FeatureId>(`f_air_${st.id}_${d}`),
          geom: { type: 'Point', coordinates: [st.lng, st.lat] },
          coefficients: { aod: bAod, t2m: bT2m, blh: bBlh, pop_density: bPop },
          local_r2: Math.min(0.98, 0.72 + rnd() * 0.24),
          residual: Number((pm25 - predicted).toFixed(2)),
          observed: Number(pm25.toFixed(1)),
          predicted: Number(predicted.toFixed(1)),
        });
      }
    }
  }

  const schema: FieldSchema[] = [
    fieldSchema('station_id', 'text', { distinct_count: YRD_STATIONS }),
    fieldSchema('lon', 'numeric', { stats: { min: 118.5, max: 122.5, mean: 120.5, std: 1.1, q25: 119.5, q50: 120.5, q75: 121.5 } }),
    fieldSchema('lat', 'numeric', { stats: { min: 29.5, max: 32.8, mean: 31.1, std: 0.9, q25: 30.4, q50: 31.1, q75: 31.9 } }),
    fieldSchema('date', 'datetime', { distinct_count: YRD_DAYS }),
    fieldSchema('pm25', 'numeric', { missing_count: 0 }),
    fieldSchema('aod', 'numeric', { missing_count: 156, missing_ratio: 0.04 }),
    fieldSchema('t2m', 'numeric'),
    fieldSchema('blh', 'numeric'),
    fieldSchema('dem', 'numeric'),
    fieldSchema('pop_density', 'numeric'),
  ];

  const column_guess: ColumnGuess = {
    longitude: 'lon', latitude: 'lat', temporal: 'date', confidence: 0.95,
    reason: '列名 lon/lat 匹配常见经纬度命名, 且取值落在合理区间; date 可解析为日期。',
  };

  return {
    dataset: {
      id: dsId,
      project_id: projectId,
      filename: 'yrd_pm25_2023071_0730.csv',
      format: 'csv',
      size_bytes: 4_182_400,
      row_count: YRD_STATIONS * YRD_DAYS,
      status: 'ingested',
      status_detail: null,
      source_crs: 'WGS84',
      schema,
      column_guess,
      created_at: asIso('2023-08-02T09:14:00Z'),
    },
    features,
    coefficients,
    xColumns: ['aod', 't2m', 'blh', 'pop_density'],
    yColumn: 'pm25',
    temporalColumn: 'date',
  };
}

/* ───────────── 场景二: 上海二手房价格空间分异 ───────────── */

export function buildHousingPrice(projectId: ProjectId): ScenarioData {
  const rnd = mulberry32(20231120);
  const dsId = asId<DatasetId>('ds_house_sh');
  const features: SpatialFeature[] = [];
  const coefficients: CoefficientPoint[] = [];

  const CBD: [number, number] = [121.4737, 31.2304]; // 人民广场
  const N = 900;

  for (let i = 0; i < N; i++) {
    const lng = between(rnd, 121.28, 121.68);
    const lat = between(rnd, 31.08, 31.42);
    const dCbd = Math.hypot((lng - CBD[0]) * 95, (lat - CBD[1]) * 111); // km
    const core = Math.max(0, 1 - dCbd / 18); // 1=核心, 0=远郊

    const area = between(rnd, 42, 168);
    const age = Math.floor(between(rnd, 1, 38));
    const subway = Math.max(0.1, between(rnd, 0.15, 3.6) * (1.6 - core));
    const poi = Math.max(3, 180 * core + gaussian(rnd, 0, 22));

    // ★ 空间非平稳: 地铁距离在近郊是强负效应, 在核心区几乎无效
    const bSubway = -0.62 * (1 - core) - 0.03;
    // 楼龄在核心区甚至为正(老洋房溢价), 在郊区为负
    const bAge = -0.34 + core * 0.52 + gaussian(rnd, 0, 0.05);
    const bArea = 0.21 + core * 0.14 + gaussian(rnd, 0, 0.04);
    const bPoi = 0.11 + core * 0.29 + gaussian(rnd, 0, 0.04);

    const price = Math.max(
      18_000,
      42_000 + 46_000 * core + bSubway * 4200 * subway + bAge * 520 * age +
        bArea * 60 * (area - 90) + bPoi * 90 * (poi - 90) + gaussian(rnd, 0, 5200),
    );

    const predicted = price + gaussian(rnd, 0, 3100);
    const fid = asId<FeatureId>(`f_house_${i}`);

    features.push({
      id: fid,
      dataset_id: dsId,
      geom: { type: 'Point', coordinates: [lng, lat] },
      observed_time: null, // 纯空间场景
      properties: {
        unit_price: Math.round(price),
        area: Number(area.toFixed(1)),
        building_age: age,
        subway_dist_km: Number(subway.toFixed(2)),
        cbd_dist_km: Number(dCbd.toFixed(2)),
        poi_density: Number(poi.toFixed(0)),
      },
    });

    coefficients.push({
      feature_id: fid,
      geom: { type: 'Point', coordinates: [lng, lat] },
      coefficients: { area: bArea, building_age: bAge, subway_dist_km: bSubway, poi_density: bPoi },
      local_r2: Math.min(0.97, 0.63 + core * 0.28 + rnd() * 0.08),
      residual: Math.round(price - predicted),
      observed: Math.round(price),
      predicted: Math.round(predicted),
    });
  }

  const schema: FieldSchema[] = [
    fieldSchema('lng', 'numeric'),
    fieldSchema('lat', 'numeric'),
    fieldSchema('unit_price', 'numeric'),
    fieldSchema('area', 'numeric'),
    fieldSchema('building_age', 'integer'),
    fieldSchema('subway_dist_km', 'numeric', { missing_count: 27, missing_ratio: 0.03 }),
    fieldSchema('cbd_dist_km', 'numeric'),
    fieldSchema('poi_density', 'numeric'),
  ];

  return {
    dataset: {
      id: dsId,
      project_id: projectId,
      filename: 'shanghai_secondhand_2023q4.xlsx',
      format: 'excel',
      size_bytes: 1_048_576,
      row_count: N,
      status: 'ingested',
      status_detail: null,
      // ★ 刻意设为 GCJ-02: 房产网站导出的数据通常是火星坐标,
      //   这份夹具就是用来验证「纠偏走通了没有」的
      source_crs: 'GCJ02',
      schema,
      column_guess: {
        longitude: 'lng', latitude: 'lat', temporal: null, confidence: 0.88,
        reason: '列名 lng/lat 匹配经纬度命名; 未发现可解析为时间的列。',
      },
      created_at: asIso('2023-11-20T02:31:00Z'),
    },
    features,
    coefficients,
    xColumns: ['area', 'building_age', 'subway_dist_km', 'poi_density'],
    yColumn: 'unit_price',
    temporalColumn: null,
  };
}

export const coefSummariesOf = (points: CoefficientPoint[], vars: string[]) =>
  vars.map((v) => summarize(v, points.map((p) => p.coefficients[v] ?? 0)));
