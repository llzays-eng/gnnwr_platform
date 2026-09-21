import type { App } from 'vue';
import { logger } from '@shared/utils/logger';
import { isAppError } from '@shared/api';

/**
 * 全局错误出口。
 * 三个入口都要接: Vue 渲染错误、未捕获 Promise、window.onerror。
 * 少接一个就会有一类错误静默消失。
 */
export function installErrorBoundary(app: App): void {
  app.config.errorHandler = (err, _instance, info) => {
    logger.report(err, { source: 'vue', info });
  };

  window.addEventListener('unhandledrejection', (e) => {
    // 已规范化的 AppError 说明 UI 层已经或将要处理它, 不重复上报
    if (isAppError(e.reason)) return;
    logger.report(e.reason, { source: 'unhandledrejection' });
  });

  window.addEventListener('error', (e) => {
    logger.report(e.error ?? e.message, { source: 'window', filename: e.filename, lineno: e.lineno });
  });
}
