import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import UnoCSS from 'unocss/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    plugins: [
      vue(),
      UnoCSS(),
      // Element Plus 按需引入。样式走 sass 变量会与我们的 CSS 变量令牌打架,
      // 所以只按需引入组件 JS, 主题统一由 shared/styles/element-bridge.css 桥接。
      Components({
        dts: 'src/components.d.ts',
        resolvers: [ElementPlusResolver({ importStyle: 'css' })],
      }),
      mode === 'analyze' && visualizer({ open: true, gzipSize: true, filename: 'dist/stats.html' }),
    ].filter(Boolean),

    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
        '@modules': fileURLToPath(new URL('./src/modules', import.meta.url)),
        '@stores': fileURLToPath(new URL('./src/stores', import.meta.url)),
      },
    },

    server: {
      port: 5173,
      // Mock 关闭时代理到真实后端, 避免前端处理 CORS 与 cookie 域问题
      proxy: env.VITE_ENABLE_MOCK === 'true' ? undefined : {
        '/api': { target: env.VITE_API_BASE_URL, changeOrigin: true },
        '/ws': { target: env.VITE_WS_BASE_URL, ws: true, changeOrigin: true },
      },
    },

    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 320,
      rollupOptions: {
        output: {
          // 分包策略: 地图与图表是最大的两块, 且只在特定路由需要,
          // 必须独立成 chunk 才能让首屏 JS 压到 180KB 预算内。
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('amap') || id.includes('loca')) return 'map';
              if (id.includes('echarts') || id.includes('zrender')) return 'charts';
              if (id.includes('element-plus')) return 'ui';
              if (id.includes('vue') || id.includes('pinia')) return 'vendor';
            }
            return undefined;
          },
        },
      },
    },

    // 让 import.meta.env 在类型层面收敛到 shared/config/env.ts 的白名单
    envPrefix: 'VITE_',
  };
});
