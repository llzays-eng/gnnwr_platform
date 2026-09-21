/**
 * 环境变量的唯一读取入口。
 *
 * 别处直接读 import.meta.env 的问题:
 *  1. 拼错变量名不会报错, 只会得到 undefined, 然后在运行时炸在很远的地方
 *  2. 无法在启动时一次性校验必填项
 * 所以这里做集中读取 + 启动自检。
 */

const bool = (v: string | undefined, fallback = false): boolean =>
  v === undefined ? fallback : v === 'true' || v === '1';

const str = (v: string | undefined, fallback = ''): string => (v ?? fallback).trim();

export const env = Object.freeze({
  apiBaseUrl: str(import.meta.env.VITE_API_BASE_URL),
  wsBaseUrl: str(import.meta.env.VITE_WS_BASE_URL),
  amapKey: str(import.meta.env.VITE_AMAP_KEY),
  amapSecurityCode: str(import.meta.env.VITE_AMAP_SECURITY_CODE),
  geoserverUrl: str(import.meta.env.VITE_GEOSERVER_URL),
  enableMock: bool(import.meta.env.VITE_ENABLE_MOCK, import.meta.env.DEV),
  /** 联调默认 false；仅在纯 Mock 演示剩余 PENDING 接口时临时开 true。 */
  assumePendingContracts: bool(import.meta.env.VITE_MOCK_ASSUME_PENDING_CONTRACTS, false),
  logLevel: str(import.meta.env.VITE_LOG_LEVEL, 'info') as 'silent' | 'error' | 'warn' | 'info' | 'debug',
  isDev: import.meta.env.DEV,
});

export interface EnvIssue {
  key: string;
  level: 'error' | 'warn';
  message: string;
}

/** 启动自检。缺 key 的时候要在控制台说人话, 而不是等地图白屏。 */
export function checkEnv(): EnvIssue[] {
  const issues: EnvIssue[] = [];
  if (!env.enableMock && !env.apiBaseUrl) {
    issues.push({ key: 'VITE_API_BASE_URL', level: 'error', message: 'Mock 已关闭但未配置后端地址, 所有请求都会失败。' });
  }
  if (!env.amapKey) {
    issues.push({
      key: 'VITE_AMAP_KEY',
      level: 'warn',
      message: '未配置高德 Key，将自动使用离线图纸底；若需高德底图请在 .env.local 填写。',
    });
  }
  if (env.amapKey && !env.amapSecurityCode) {
    issues.push({ key: 'VITE_AMAP_SECURITY_CODE', level: 'warn', message: '高德 2.0 未配置安全密钥, 部分服务(如地理编码)会 403。' });
  }
  if (env.geoserverUrl && !env.enableMock) {
    issues.push({
      key: 'VITE_GEOSERVER_URL',
      level: 'warn',
      message: '独立前端联调以 backend /spatial/surface 返回地址为准；VITE_GEOSERVER_URL 仅保留兼容用途。',
    });
  }
  return issues;
}
