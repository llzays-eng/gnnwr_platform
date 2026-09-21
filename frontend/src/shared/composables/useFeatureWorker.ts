import * as Comlink from 'comlink';
import type { SpatialFeature } from '../types';
import type { FeatureParseApi, ParsedFeatures } from '../workers/feature-parse.worker';

let worker: Worker | null = null;
let api: Comlink.Remote<FeatureParseApi> | null = null;

function ensure(): Comlink.Remote<FeatureParseApi> {
  if (!api) {
    worker = new Worker(new URL('../workers/feature-parse.worker.ts', import.meta.url), { type: 'module' });
    api = Comlink.wrap<FeatureParseApi>(worker);
  }
  return api;
}

/**
 * 单例 Worker。
 * 每次调用都新建 Worker 的话, 拖动地图时会瞬间创建几十个线程 ——
 * 比不用 Worker 还糟。
 */
export async function parseFeatures(
  features: readonly SpatialFeature[],
  valueField: string | null,
): Promise<ParsedFeatures> {
  return ensure().parse(features as SpatialFeature[], valueField);
}

export function disposeFeatureWorker(): void {
  worker?.terminate();
  worker = null; api = null;
}
