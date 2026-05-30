interface Window {
  __TAURI_INTERNALS__?: Record<string, unknown>
  __TAURI__?: Record<string, unknown>
  Capacitor?: { isNativePlatform?: () => boolean }
}
