'use client'

import { useState, useEffect } from 'react'
import { Minus, Maximize2, Minimize2, X } from 'lucide-react'

/**
 * 应用窗口控制按钮（Tauri 环境下生效；浏览器里三个调用静默失败）。
 * 自己订阅最大化状态（Tauri resize 事件），因此不再需要外部 props。
 */
export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return
    let unlisten: (() => void) | undefined

    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      const aw = getCurrentWindow()
      aw.isMaximized().then(setIsMaximized).catch(() => {})
      aw.onResized(async () => {
        const maximized = await aw.isMaximized()
        setIsMaximized(maximized)
      }).then((fn) => { unlisten = fn }).catch(() => {})
    })

    return () => { unlisten?.() }
  }, [])

  return (
    <div className="flex items-center gap-0">
      <button
        className="flex h-6 w-6 items-center justify-center text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink"
        onClick={() => { import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().minimize()).catch(() => {}) }}
        aria-label="最小化"
      >
        <Minus size={13} strokeWidth={2} />
      </button>
      <button
        className="flex h-6 w-6 items-center justify-center text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink"
        onClick={() => { import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().toggleMaximize()).catch(() => {}) }}
        aria-label={isMaximized ? '还原' : '最大化'}
      >
        {isMaximized ? <Minimize2 size={13} strokeWidth={2} /> : <Maximize2 size={13} strokeWidth={2} />}
      </button>
      <button
        className="flex h-6 w-6 items-center justify-center text-ink-muted transition-colors hover:bg-red-500/15 hover:text-error dark:hover:bg-red-500/20"
        onClick={() => { import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().close()).catch(() => {}) }}
        aria-label="关闭"
      >
        <X size={13} strokeWidth={2} />
      </button>
    </div>
  )
}

