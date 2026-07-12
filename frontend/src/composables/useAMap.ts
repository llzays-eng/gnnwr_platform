// 高德 JS API 2.0 加载器（单例）。
// 设计目标：地图能力是"渐进增强"而非硬依赖 ——
//   · 配了 VITE_AMAP_KEY  → 加载真实底图（暗色样式，与平台主题一致）
//   · 没配 / 加载失败 / 超时 → 调用方收到 reject，降级为离线 Canvas 渲染
// 这样离线环境、内网环境、未申请 key 的评审环境都能完整跑通闭环。
import AMapLoader from '@amap/amap-jsapi-loader'

let pending: Promise<any> | null = null

/** 是否配置了高德 key（构建期注入，见 frontend/.env 与 Dockerfile ARG） */
export function amapConfigured(): boolean {
  return Boolean(import.meta.env.VITE_AMAP_KEY)
}

/**
 * 加载高德 JS API，返回 AMap 命名空间。
 * 多个组件共享同一个加载 Promise；失败后清空缓存，允许下次重试。
 */
export function loadAMap(timeoutMs = 10000): Promise<any> {
  if (!amapConfigured()) return Promise.reject(new Error('未配置 VITE_AMAP_KEY'))
  if (!pending) {
    // JSAPI 2.0 安全密钥：必须在脚本加载前挂到 window（官方要求）
    const sec = import.meta.env.VITE_AMAP_SECURITY
    if (sec) window._AMapSecurityConfig = { securityJsCode: sec }

    const load = AMapLoader.load({
      key: import.meta.env.VITE_AMAP_KEY,
      version: '2.0',
      plugins: [], // CircleMarker / setFitView 均在 2.0 核心包内，无需额外插件
    })
    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error('高德 JS API 加载超时（网络受限？将降级为离线画布）')), timeoutMs),
    )
    pending = Promise.race([load, timeout]).catch((e) => {
      pending = null // 失败不缓存，路由重进可重试
      throw e
    })
  }
  return pending
}
