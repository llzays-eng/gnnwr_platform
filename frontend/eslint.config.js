import js from '@eslint/js';
import ts from 'typescript-eslint';
import vue from 'eslint-plugin-vue';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.strictTypeChecked,
  ...vue.configs['flat/recommended'],
  {
    languageOptions: {
      parserOptions: { project: ['./tsconfig.app.json'], extraFileExtensions: ['.vue'] },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      'vue/multi-word-component-names': 'off',
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
      'no-console': ['error', { allow: [] }],
      'no-restricted-globals': [
        'error',
        // 全局 fetch 会绕过 axios 拦截器(鉴权/错误映射/取消), 必须走 shared/api/http.ts
        { name: 'fetch', message: '请使用 @shared/api/http 的封装, 直接 fetch 会绕过鉴权与错误映射。' },
      ],
    },
  },

  /* ────────────────────────────────────────────────────────────────
   * 坐标系纪律的构建期防线。
   * 除 shared/geo 自身外, 任何文件都不允许 import 坐标变换实现,
   * 只能 import 类型与 shared/geo 的公开出口。
   * 这条规则的意义: 让"在别处偷偷转一次坐标"这件事物理上做不到,
   * 而不是靠 code review 抓。
   * ──────────────────────────────────────────────────────────────── */
  {
    files: ['src/**/*.{ts,vue}'],
    ignores: ['src/shared/geo/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['**/geo/transform', '**/geo/transform.js', '@shared/geo/transform'],
            message: '坐标变换只能通过 @shared/geo 的 project()/toRenderCRS() 调用, 不得直接引用实现。',
          },
        ],
      }],
    },
  },

  /* Mock 与 fixture 允许 console 与 any, 它们不进生产包 */
  {
    files: ['src/mocks/**/*.ts', 'src/**/__tests__/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  { ignores: ['dist/**', 'node_modules/**', 'public/mockServiceWorker.js', 'src/components.d.ts'] },
);
