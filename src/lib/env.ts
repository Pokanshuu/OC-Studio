// 运行环境统一检测 — 全项目唯一权威实现。
// 其余模块（browser-compat / image-service / export / settings 等）一律从这里导入，
// 禁止再内联 `window.__TAURI__` / `window.Capacitor` 判断。
// 唯一例外：app/layout.tsx 的防闪烁 inline script（hydration 前执行，无法 import）。

export function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  )
}

export function isCapacitor(): boolean {
  // Capacitor runtime 已注入（WebView 环境）
  return typeof window !== 'undefined' && !!window.Capacitor && !isTauri()
}

export function isNativePlatform(): boolean {
  // 真正的原生 App 壳（Capacitor isNativePlatform 为 true），
  // 排除 cap serve 等纯 Web 预览场景
  return isCapacitor() && window.Capacitor?.isNativePlatform?.() === true
}

export function isMobilePlatform(): boolean {
  return isCapacitor()
}

export function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false
  // Tauri 的 macOS WebView（WKWebView）与 Chrome/Safari 都认 Macintosh。
  // 注意 navigator.platform 在 macOS 上是 **MacIntel**（不是 Macintosh），
  // 只测 "Macintosh" 会把真机判成非 mac —— 这里 platform 走 /Mac/，UA 再兜一层。
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
  if (uaData?.platform) return uaData.platform === 'macOS'
  const platform = navigator.platform || ''
  if (/Mac/i.test(platform)) return true
  return /Macintosh|Mac OS X/i.test(navigator.userAgent || '')
}

/**
 * 首帧平台标记：把 `<html data-os>` 落成 `mac` / `other`。
 *
 * 为什么要提前落值：菜单栏左侧要给 macOS 的原生红绿灯留白、右上角要藏掉
 * 自绘窗口按钮 —— 这些如果等 React 起来再按 `isMacOS()` 改 className，
 * 服务端渲染的 HTML 与首个客户端帧对不上，会闪一下再归位。判定交给 CSS
 * （`[data-os='mac']`），class 从首帧起就是对的。
 *
 * 与主题脚本同理：必须在 hydration 前执行，所以不能 import —— layout.tsx 内联。
 */
export const PLATFORM_BOOT_SCRIPT = `(function(){try{
var r=document.documentElement;
var p=(navigator.userAgentData&&navigator.userAgentData.platform)||navigator.platform||navigator.userAgent||'';
r.setAttribute('data-os',/mac/i.test(p)?'mac':'other');
}catch(e){}})()`
