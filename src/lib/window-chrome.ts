'use client'

/**
 * 桌面窗口桥。
 *
 * 同一套 UI 同时面对三种宿主：
 * - Tauri v2：使用 @tauri-apps/api/window
 * - WebView2 便携壳：通过 window.chrome.webview 与 C# 宿主通信
 * - 浏览器开发：所有窗口操作退化为 no-op
 *
 * 这样标题栏按钮和拖动逻辑不需要在组件里判断宿主类型。
 */

export type WindowHost = 'tauri' | 'webview2' | 'browser'
export type WindowAction = 'minimize' | 'toggleMaximize' | 'close'

interface WebView2MessageEvent {
  data?: unknown
}

interface WebView2Host {
  postMessage: (message: unknown) => void
  addEventListener: (type: 'message', listener: (event: WebView2MessageEvent) => void) => void
  removeEventListener: (type: 'message', listener: (event: WebView2MessageEvent) => void) => void
}

interface WindowWithWebView2 extends Window {
  chrome?: {
    webview?: WebView2Host
  }
}

interface WindowStateMessage {
  type: 'oc-window-state'
  maximized: boolean
}

function webviewHost(): WebView2Host | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as WindowWithWebView2).chrome?.webview
}

export function getWindowHost(): WindowHost {
  if (typeof window === 'undefined') return 'browser'
  if ('__TAURI_INTERNALS__' in window) return 'tauri'
  if (webviewHost()) return 'webview2'
  return 'browser'
}

function postWebView2(message: unknown): void {
  webviewHost()?.postMessage(message)
}

export async function startWindowDrag(): Promise<void> {
  const host = getWindowHost()
  if (host === 'tauri') {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().startDragging()
    } catch {
      // 浏览器或权限缺失时静默失败
    }
    return
  }
  if (host === 'webview2') {
    postWebView2({ type: 'oc-window', action: 'drag' })
  }
}

export async function performWindowAction(action: WindowAction): Promise<void> {
  const host = getWindowHost()
  if (host === 'tauri') {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const win = getCurrentWindow()
      if (action === 'minimize') await win.minimize()
      else if (action === 'toggleMaximize') await win.toggleMaximize()
      else await win.close()
    } catch {
      // 静默失败，避免在浏览器开发环境抛错
    }
    return
  }
  if (host === 'webview2') {
    postWebView2({ type: 'oc-window', action })
  }
}

/**
 * 订阅最大化状态。返回取消订阅函数。
 * Tauri 用 onResized，WebView2 用宿主回传的 oc-window-state。
 */
export function subscribeWindowMaximized(
  callback: (maximized: boolean) => void,
): () => void {
  const host = getWindowHost()
  let disposed = false
  let unlisten: (() => void) | undefined

  if (host === 'tauri') {
    void import('@tauri-apps/api/window')
      .then(async ({ getCurrentWindow }) => {
        if (disposed) return
        const win = getCurrentWindow()
        callback(await win.isMaximized())
        unlisten = await win.onResized(async () => {
          if (!disposed) callback(await win.isMaximized())
        })
      })
      .catch(() => {})
  } else if (host === 'webview2') {
    const webview = webviewHost()
    if (webview) {
      const listener = (event: WebView2MessageEvent): void => {
        const data = event.data as WindowStateMessage | undefined
        if (data?.type === 'oc-window-state' && typeof data.maximized === 'boolean') {
          callback(data.maximized)
        }
      }
      webview.addEventListener('message', listener)
      postWebView2({ type: 'oc-window', action: 'state' })
      return () => {
        disposed = true
        webview.removeEventListener('message', listener)
      }
    }
  }

  return () => {
    disposed = true
    unlisten?.()
  }
}
