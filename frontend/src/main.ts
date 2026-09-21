import { createApp } from 'vue';
import { createPinia } from 'pinia';
import 'virtual:uno.css';
import '@shared/styles/base.css';

import App from './App.vue';
import { router } from './app/router';
import { installErrorBoundary } from './app/boot/error-boundary';
import { VueQueryPlugin, queryOptions } from './app/boot/query';
import { bindAuthToHttp } from '@stores/index';
import { checkEnv, env } from '@shared/config/env';
import { logger } from '@shared/utils/logger';

async function bootstrap(): Promise<void> {
  // 启动自检要在任何请求之前, 缺 key 时在控制台说人话而不是等地图白屏
  for (const issue of checkEnv()) {
    logger[issue.level](`[env] ${issue.key}: ${issue.message}`);
  }

  // Mock 必须在 app.mount 之前 await 起来,
  // 否则首屏那几个请求会漏过 Service Worker 打到真网络
  if (env.enableMock) {
    const { startMock } = await import('./mocks/browser');
    await startMock();
    logger.info('Mock 已启用。控制台可用 __mockWs 调试 WebSocket 断线与降级。');
  }

  const app = createApp(App);
  app.use(createPinia());

  // Pinia 装好之后再绑鉴权钩子 —— http.ts 不 import store, 靠这里注入,
  // 避免 http ← store ← http 的循环依赖
  bindAuthToHttp(() => { void router.push({ name: 'login' }); });

  app.use(router);
  app.use(VueQueryPlugin, queryOptions);
  installErrorBoundary(app);

  await router.isReady();
  app.mount('#app');
}

void bootstrap();
