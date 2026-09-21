import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@modules': fileURLToPath(new URL('./src/modules', import.meta.url)),
      '@stores': fileURLToPath(new URL('./src/stores', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // MSW 的 handler 在测试里复用同一份, 这是选 MSW 而非 vite-plugin-mock 的主要原因
    setupFiles: ['src/mocks/vitest-setup.ts'],
    include: ['src/**/__tests__/**/*.spec.ts'],
  },
});
