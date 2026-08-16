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
