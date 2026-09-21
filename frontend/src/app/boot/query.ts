import { VueQueryPlugin, type VueQueryPluginOptions } from '@tanstack/vue-query';
import { isAppError } from '@shared/api';

/**
 * 服务端状态缓存。
 *
 * 与 Pinia 的分工: Pinia 只放"用户决定的东西", vue-query 只放"服务端说的东西"。
 * 把请求缓存塞进 Pinia 的后果是每个 store 都长出一套 loading/error/stale/refetch。
 */
export const queryOptions: VueQueryPluginOptions = {
  queryClientConfig: {
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        // http.ts 已经做过重试, 这里不再叠加。
        // 唯一例外: 契约缺失的接口重试毫无意义, 显式关掉。
        retry: (_count, error) => !isAppError(error),
      },
    },
  },
};

export { VueQueryPlugin };
