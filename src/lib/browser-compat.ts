// 运行环境检测（实现已收敛到 lib/env.ts，此处保留再导出以兼容既有导入）
export { isCapacitor, isTauri, isMobilePlatform, isNativePlatform } from './env'

// WebView 内核版本检测（Chromium 版本号）
export function getChromiumVersion(): number | null {
  if (typeof navigator === 'undefined') return null
  const match = navigator.userAgent.match(/Chrome\/(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

export const MIN_CHROMIUM_VERSION = 114

export function isBelowTargetVersion(): boolean {
  const version = getChromiumVersion()
  return version !== null && version < MIN_CHROMIUM_VERSION
}

export function supportsTransitionBehavior(): boolean {
  return typeof CSS !== 'undefined' && CSS.supports('transition-behavior', 'allow-discrete')
}

export function supportsStartingStyle(): boolean {
  return typeof CSS !== 'undefined' && CSS.supports('at-rule', 'starting-style')
}

export function needsAnimationFallback(): boolean {
  return !supportsTransitionBehavior() || !supportsStartingStyle()
}

// HarmonyOS / OpenHarmony 检测
// ArkWeb UA 格式: ... OpenHarmony/<version> ... ArkWeb/<version> ...
// 参考: https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/web-default-useragent
export function isHarmonyOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /OpenHarmony/i.test(navigator.userAgent)
}

export function getHarmonyOSVersion(): number | null {
  if (typeof navigator === 'undefined') return null
  const match = navigator.userAgent.match(/OpenHarmony\s+(\d+\.?\d*)/i)
  return match ? parseFloat(match[1]) : null
}

export function isHarmonyOS4(): boolean {
  const version = getHarmonyOSVersion()
  return version !== null && version >= 4 && version < 5
}

export function isHarmonyOSNext(): boolean {
  const version = getHarmonyOSVersion()
  return version !== null && version >= 5
}

// 安全区域估算 — 当 env(safe-area-inset-*) 返回 0 时使用
// 注意：screen.height / screen.availHeight 已是 CSS pixels，无需 dpr 换算
export function estimateSafeAreaInsets(): { top: number; bottom: number } {
  if (typeof window === 'undefined') return { top: 0, bottom: 0 }

  // 方案 1：从 CSS 变量直接读取（如果 Native 端已正确设置）
  const envTop = getComputedStyle(document.documentElement).getPropertyValue('--safe-top').trim()
  const envBottom = getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom').trim()
  const parsedTop = parseFloat(envTop)
  const parsedBottom = parseFloat(envBottom)
  if (parsedTop > 0 || parsedBottom > 0) {
    return { top: parsedTop || 24, bottom: parsedBottom || 16 }
  }

  // 方案 2：screen 差值法 — 仅用于估算状态栏高度
  // 底部导航栏放弃动态估算（模拟器 env() 总是 48dp 无法区分模式），统一用手势条高度 16dp
  const screenDiff = Math.max(window.screen.height - window.screen.availHeight, 0)
  if (screenDiff > 0) {
    const top = Math.min(Math.max(Math.round(screenDiff * 0.4), 20), 32)
    return { top, bottom: 16 }
  }

  // 方案 3：screenDiff=0 时取默认值
  return { top: 24, bottom: 16 }
}

// 检测 env(safe-area-inset-*) 是否可用（返回非零值）
// HarmonyOS ArkWeb 需要 viewport-fit=cover + Native expandSafeArea 才生效
export function isSafeAreaEnvAvailable(): boolean {
  if (typeof CSS === 'undefined') return false
  // 使用 CSS.supports 检查 env() 支持，然后通过 computed style 验证实际值
  if (!CSS.supports('padding-top', 'env(safe-area-inset-top)')) return false
  // 创建临时元素检测实际值
  const test = document.createElement('div')
  test.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding-top:env(safe-area-inset-top);visibility:hidden;pointer-events:none'
  document.body.appendChild(test)
  const pt = parseFloat(getComputedStyle(test).paddingTop)
  document.body.removeChild(test)
  return pt > 0
}

// 获取 env(safe-area-inset-bottom) 的实际计算值（CSS px）
function getEnvSafeAreaBottom(): number {
  if (typeof document === 'undefined') return 0
  const test = document.createElement('div')
  test.style.cssText = 'position:fixed;bottom:0;left:0;width:1px;height:1px;padding-bottom:env(safe-area-inset-bottom);visibility:hidden;pointer-events:none'
  document.body.appendChild(test)
  const pb = parseFloat(getComputedStyle(test).paddingBottom)
  document.body.removeChild(test)
  return pb || 0
}

// 检测 env() 返回的 bottom 值是否与屏幕差值估算严重偏离
// 返回 null = 无需修正（现代设备正常）；返回 number = 修正后的 bottom 值
// 仅在移动端 Capacitor 环境调用，现代路径不受影响
export function getSafeAreaBottomCorrection(): number | null {
  if (typeof window === 'undefined') return null

  const envBottom = getEnvSafeAreaBottom()
  if (envBottom <= 0) return null // env() 返回 0 = 走已有 fallback 流程，此处不处理

  const screenDiff = Math.max(window.screen.height - window.screen.availHeight, 0)
  if (screenDiff <= 0) return null // 无法估算，不做修正

  // 状态栏按 20-32dp 估算，剩余归导航栏
  const estimatedTop = Math.min(Math.max(Math.round(screenDiff * 0.4), 20), 32)
  const estimatedBottom = Math.max(screenDiff - estimatedTop, 0)

  // env() 返回的 bottom 比屏幕差值估算大 ≥16px → 判定为模拟器类异常
  if (envBottom - estimatedBottom >= 16) {
    return estimatedBottom
  }

  return null
}
