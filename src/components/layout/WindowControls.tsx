'use client'

import { useState, useEffect } from 'react'
import { CloseGlyph, MaximizeGlyph, MinimizeGlyph, RestoreGlyph } from './window-glyphs'
import { WINDOW_BTN, WINDOW_BTN_CLOSE } from '@/lib/ui-tokens'

/**
 * 应用窗口控制按钮（Tauri 环境下生效；浏览器里三个调用静默失败）。
 * 自己订阅最大化状态（Tauri resize 事件），因此不再需要外部 props。
 *
 * 版式照 Windows 11 的系统标题栏：
 * - `h-8 w-[46px]`、`rounded-none`：整条贴死窗口右上角（Fitts 定律 —— 鼠标甩到
 *   屏幕角落就该能点到关闭）。以前是 24×24 的圆角小方块 + 右缩 4px，角落点不到；
 * - 字形是系统画的那四个（见 `window-glyphs.tsx`），不是 lucide 的斜箭头；
 * - 关闭悬停是**实心红**：这是少数几个该打破「界面无色」的地方，用户靠那块红
 *   确认「我要关的是窗口」。
 *
 * macOS 不渲染这一组：系统红绿灯已经提供了同样的三个动作，见 globals.css 的
 * `[data-os='mac'] [data-window-controls]`（用 CSS 藏，不用 isMacOS() 判，
 * 否则首帧服务端与客户端不一致）。
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

  const run = (action: 'minimize' | 'toggle' | 'close') => {
    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => {
        const aw = getCurrentWindow()
        if (action === 'minimize') return aw.minimize()
        if (action === 'toggle') return aw.toggleMaximize()
        return aw.close()
      })
      .catch(() => {})
  }

  return (
    <div data-window-controls className="flex items-center gap-0">
      <button
        type="button"
        className={WINDOW_BTN}
        onClick={() => run('minimize')}
        aria-label="最小化"
      >
        <MinimizeGlyph />
      </button>
      <button
        type="button"
        className={WINDOW_BTN}
        onClick={() => run('toggle')}
        aria-label={isMaximized ? '还原' : '最大化'}
      >
        {isMaximized ? <RestoreGlyph /> : <MaximizeGlyph />}
      </button>
      <button
        type="button"
        className={WINDOW_BTN_CLOSE}
        onClick={() => run('close')}
        aria-label="关闭"
      >
        <CloseGlyph />
      </button>
    </div>
  )
}
