import type { Dataset, DatasetId, DatasetPreview, Paginated, PreprocessRequest, ProjectId, UploadId } from '../types';
import { FROZEN } from './endpoints';
import { get, post, request } from './http';

export interface UploadProgress {
  loaded: number;
  total: number;
  ratio: number;
}

export const datasetApi = {
  /** 冻结接口: 单次 multipart 上传 */
  upload: (
    projectId: ProjectId,
    file: File,
    onProgress?: (p: UploadProgress) => void,
    signal?: AbortSignal,
  ) => {
    const form = new FormData();
    form.append('file', file);
    form.append('project_id', projectId);
    return request<Dataset>({
      url: FROZEN.uploadDataset,
      method: 'post',
      data: form,
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 0, // 大文件不设超时, 由 signal 控制取消
      signal,
      onUploadProgress: (e) => {
        const total = e.total ?? file.size;
        onProgress?.({ loaded: e.loaded, total, ratio: total ? e.loaded / total : 0 });
      },
    });
  },

  preview: (id: DatasetId, rows = 20) =>
    get<DatasetPreview>(FROZEN.previewDataset(id), { params: { rows } }),

  preprocess: (id: DatasetId, body: PreprocessRequest) =>
    post<Dataset>(FROZEN.preprocessDataset(id), body),

  list: (projectId: ProjectId) =>
    get<Paginated<Dataset>>(FROZEN.listDatasets, { params: { project_id: projectId } }),

  /**
   * 分片上传三步。>200MB 走这条; 若接错旧后端导致 404，useUpload 会回落单次上传并提示。
   */
  chunkInit: (projectId: ProjectId, file: File, chunkSize: number) =>
    post<{ upload_id: UploadId; uploaded_chunks: number[] }>(
      FROZEN.uploadInit,
      { project_id: projectId, filename: file.name, size: file.size, chunk_size: chunkSize },
    ),

  chunkPut: (uploadId: UploadId, index: number, blob: Blob, signal?: AbortSignal) =>
    request<void>({
      url: FROZEN.uploadChunk(uploadId, index),
      method: 'put',
      data: blob,
      headers: { 'Content-Type': 'application/octet-stream' },
      timeout: 0,
      signal,
    }),

  chunkComplete: (uploadId: UploadId) =>
    post<Dataset>(FROZEN.uploadComplete(uploadId), undefined),
};
