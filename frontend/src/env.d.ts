/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_WS_BASE_URL: string;
  readonly VITE_AMAP_KEY: string;
  readonly VITE_AMAP_SECURITY_CODE: string;
  readonly VITE_GEOSERVER_URL: string;
  readonly VITE_ENABLE_MOCK: string;
  readonly VITE_MOCK_ASSUME_PENDING_CONTRACTS: string;
  readonly VITE_LOG_LEVEL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

/** 高德 2.0 的安全密钥必须挂在 window 上, 这是官方要求的形式 */
interface Window {
  _AMapSecurityConfig?: { securityJsCode?: string; serviceHost?: string };
}
