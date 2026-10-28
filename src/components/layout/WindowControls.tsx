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

  // 与顶栏的内边距对齐：菜单栏 px-3（12px），按钮 24px / 栏 32px → 上边留 4px，
  // 这里用 -mr-2 把右边也收到 4px，窗口右上角的留白才一致。
  return (
    <div className="flex items-center gap-0 -mr-2">
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
        className="flex h-6 w-6 items-center justify-center text-ink-muted transition-colors hover:bg-error-light hover:text-error"
        onClick={() => { import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().close()).catch(() => {}) }}
        aria-label="关闭"
      >
        <X size={13} strokeWidth={2} />
      </button>
    </div>
  )
}

