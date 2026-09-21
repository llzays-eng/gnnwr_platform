import { ref } from 'vue';
import { datasetApi, isAppError } from '@shared/api';
import type { Dataset, ProjectId } from '@shared/types';
import { logger } from '@shared/utils/logger';

const log = logger.child('upload');
const CHUNK = 8 * 1024 * 1024;
const SINGLE_LIMIT = 200 * 1024 * 1024;

export const ACCEPT = ['.csv', '.xlsx', '.xls', '.geojson', '.json', '.zip'] as const;

/** 前端预校验: 格式与体积。目的是避免把注定失败的请求发出去。 */
export function precheck(file: File): { ok: true } | { ok: false; reason: string; fix: string } {
  const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
  if (!ACCEPT.includes(ext as (typeof ACCEPT)[number])) {
    return { ok: false, reason: `不支持的格式 ${ext}`, fix: `请上传 ${ACCEPT.join(' / ')}；Shapefile 需打包为 .zip` };
  }
  if (file.size === 0) return { ok: false, reason: '文件为空', fix: '检查导出是否成功后重新选择' };
  if (file.size > 2 * 1024 ** 3) {
    return { ok: false, reason: '文件超过 2GB', fix: '按时间或区域拆分后分批上传' };
  }
  return { ok: true };
}

export interface UploadState {
  progress: number;
  phase: 'idle' | 'uploading' | 'done' | 'error' | 'cancelled';
  message: string;
  dataset: Dataset | null;
}

/**
 * 上传。
 *
 * 分片接口在联调后端已冻结；这里仍保留运行时回落，
 * 用于识别「接到了错误后端（如 monorepo 旧服务）」并给出明确提示。
 */
export function useUpload(projectId: ProjectId) {
  const state = ref<UploadState>({ progress: 0, phase: 'idle', message: '', dataset: null });
  let abort: AbortController | null = null;

  async function chunked(file: File): Promise<Dataset> {
    let init;
    try {
      init = await datasetApi.chunkInit(projectId, file, CHUNK);
    } catch (e) {
      if (isAppError(e) && (e.code === 'CONTRACT_MISSING' || e.code === 'NOT_FOUND' || e.code === 'UNKNOWN')) {
        log.warn('分片接口不可用, 回落单次上传', e.code);
        state.value.message = '分片上传接口不可用，已回落单次上传（请确认后端基线）。';
        return datasetApi.upload(projectId, file, (p) => { state.value.progress = p.ratio; }, abort!.signal);
      }
      throw e;
    }
    const total = Math.ceil(file.size / CHUNK);
    const done = new Set(init.uploaded_chunks); // 断点续传: 跳过已传分片
    for (let i = 0; i < total; i++) {
      if (done.has(i)) { state.value.progress = (i + 1) / total; continue; }
      await datasetApi.chunkPut(init.upload_id, i, file.slice(i * CHUNK, (i + 1) * CHUNK), abort!.signal);
      state.value.progress = (i + 1) / total;
    }
    return datasetApi.chunkComplete(init.upload_id);
  }

  async function start(file: File): Promise<Dataset | null> {
    const chk = precheck(file);
    if (!chk.ok) {
      state.value = { progress: 0, phase: 'error', message: `${chk.reason}。${chk.fix}`, dataset: null };
      return null;
    }
    abort = new AbortController();
    state.value = { progress: 0, phase: 'uploading', message: '正在上传', dataset: null };
    try {
      const ds = file.size > SINGLE_LIMIT
        ? await chunked(file)
        : await datasetApi.upload(projectId, file, (p) => { state.value.progress = p.ratio; }, abort.signal);
      state.value = { progress: 1, phase: 'done', message: '上传完成', dataset: ds };
      return ds;
    } catch (e) {
      if (isAppError(e) && e.code === 'REQUEST_CANCELLED') {
        state.value = { ...state.value, phase: 'cancelled', message: '已取消' };
        return null;
      }
      state.value = {
        ...state.value,
        phase: 'error',
        message: isAppError(e) ? `${e.message}${e.actions.length ? ` ${e.actions[0]}` : ''}` : '上传失败，请重试',
      };
      return null;
    }
  }

  return { state, start, cancel: () => { abort?.abort(); } };
}
