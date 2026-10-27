'use client'

import { useSyncExternalStore } from 'react'

/**
 * 当前是否暗色主题。
 *
 * 主题由 `settings.tsx` 写在 `<html class="dark" data-theme="…">` 上，**不是一个 React 状态**。
 * 直接在一次渲染里读 `classList.contains('dark')` 会拿到「那一刻」的值且永不更新 ——
 * 切换主题后需要固定底色的色块（时期条）就会一直用错分支。
 * 这里用 MutationObserver + 系统配色媒体查询订阅它，切换主题会真的重新渲染。
 */
function subscribe(onChange: () => void): () => void {
  const root = document.documentElement
  const observer = new MutationObserver(onChange)
  observer.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] })
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', onChange)
  return () => {
    observer.disconnect()
    media.removeEventListener('change', onChange)
  }
}

function getSnapshot(): boolean {
  return document.documentElement.classList.contains('dark')
}

/** 服务端 / 静态导出时不知道用户主题，先按亮色 */
function getServerSnapshot(): boolean {
  return false
}

export function useIsDarkTheme(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
