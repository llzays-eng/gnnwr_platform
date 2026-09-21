import { http } from 'msw';
import { FROZEN } from '@shared/api/endpoints';
import type { Dataset, DatasetPreview, Paginated, PreprocessRequest } from '@shared/types';
import { asId, asIso } from '@shared/types';
import type { DatasetId, ProjectId } from '@shared/types';
import { db, scenarios } from '../db';
import { fail, lag, ok } from './_util';

const findDs = (id: string): Dataset | undefined => db.datasets.find((d) => d.id === id);

export const datasetHandlers = [
  http.post(FROZEN.uploadDataset, async ({ request }) => {
    await lag(600, 1400);
    const form = await request.formData();
    const file = form.get('file');
    const projectId = String(form.get('project_id') ?? '');
    if (!(file instanceof File)) return fail(422, '未收到文件。请重新选择后上传。');
    if (file.size > 200 * 1024 * 1024) {
      return fail(413, '文件超过 200MB。请拆分后分批上传, 或联系管理员调整上限。');
    }

    // 新上传的文件按项目场景挂到对应夹具的 schema 上, 这样后续流程能走通。
    // 真实后端会做格式嗅探, Mock 这里按文件名后缀简化。
    const template = scenarios[asId<ProjectId>(projectId)] ?? Object.values(scenarios)[0]!;
    const ds: Dataset = {
      ...template.dataset,
      id: asId<DatasetId>(db.nextId('ds')),
      project_id: asId<ProjectId>(projectId),
      filename: file.name,
      size_bytes: file.size,
      status: 'uploaded',
      source_crs: null, // ★ 必须由用户显式确认, 不替他猜
      created_at: asIso(new Date().toISOString()),
    };
    db.datasets.unshift(ds);
    return ok(ds);
  }),

  http.get(FROZEN.previewDataset(':id'), async ({ params, request }) => {
    await lag();
    const ds = findDs(String(params['id']));
    if (!ds) return fail(404, '数据集不存在。');
    const n = Number(new URL(request.url).searchParams.get('rows') ?? 20);
    const sc = Object.values(scenarios).find((s) => s.dataset.filename === ds.filename)
      ?? Object.values(scenarios)[0]!;

    const rows = sc.features.slice(0, n).map((f) => ({
      lon: f.geom.coordinates[0],
      lat: f.geom.coordinates[1],
      date: f.observed_time,
      ...f.properties,
    }));

    const sample = sc.features
      .filter((_, i) => i % Math.max(1, Math.floor(sc.features.length / 800)) === 0)
      .map((f) => f.geom.coordinates as readonly [number, number]);

    const res: DatasetPreview = {
      dataset_id: ds.id,
      total_rows: ds.row_count,
      columns: ds.schema.map((s) => s.name),
      rows,
      spatial_sample: sample,
      offshore_ratio: 0,
    };
    return ok(res);
  }),

  http.post(FROZEN.preprocessDataset(':id'), async ({ params, request }) => {
    await lag(400, 900);
    const ds = findDs(String(params['id']));
    if (!ds) return fail(404, '数据集不存在。');
    const body = (await request.json()) as PreprocessRequest;

    if (!body.source_crs) {
      return fail(422, '未指定原始坐标系。后端统一按 WGS84 计算, 必须先声明数据本身是什么坐标系。');
    }
    if (!body.longitude_column || !body.latitude_column) {
      return fail(422, '未指定经纬度列。');
    }

    const idx = db.datasets.findIndex((d) => d.id === ds.id);
    const updated: Dataset = { ...ds, status: 'ingested', source_crs: body.source_crs, status_detail: null };
    db.datasets[idx] = updated;
    return ok(updated);
  }),

  // list / 分片已解冻(协商清单 #9 #2)
  http.get(FROZEN.listDatasets, async ({ request }) => {
    await lag();
    const pid = new URL(request.url).searchParams.get('project_id');
    const items = db.datasets.filter((d) => !pid || d.project_id === pid);
    const res: Paginated<Dataset> = { items, total: items.length, page: 1, page_size: 50 };
    return ok(res);
  }),

  http.post(FROZEN.uploadInit, async () => {
    return ok({ upload_id: db.nextId('up'), uploaded_chunks: [] as number[] });
  }),
  http.put('/api/v1/datasets/upload/:uid/chunk/:n', async () => {
    await lag(80, 200);
    return ok(null);
  }),
  http.post('/api/v1/datasets/upload/:uid/complete', async () => {
    return ok(db.datasets[0] ?? null);
  }),
];
