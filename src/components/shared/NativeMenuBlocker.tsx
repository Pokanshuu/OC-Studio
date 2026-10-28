'use client'

import { useEffect } from 'react'

// ── 屏蔽 WebView 自带的右键菜单（全局兜底） ─────────────────────────────
// 应用自己的右键菜单由 `GlobalContextMenu` 提供，但它是挂在 AppShell 里的，
// 而启动闸门（VaultGate）包在 AppShell **外面** —— 闸门显示的时候，
// 那里一个监听都没有，右键就会弹出 WebView 自带的「刷新 / 另存为 / 检查」。
//
// 这个组件挂在最外层，只做一件事：非文本区吃掉系统菜单。
// 文本区（input / textarea / 可编辑区）保持浏览器原生菜单，输入法要用。

const NON_TEXT_INPUT_TYPES = [
  'radio',
  'checkbox',
  'button',
  'submit',
  'reset',
  'file',
  'image',
  'range',
  'color',
]

function isTextTarget(target: HTMLElement): boolean {
  if (target.closest?.('.ProseMirror') !== null && target.closest?.('.ProseMirror') !== undefined) {
    return true
  }
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.includes(target.type)
  return target instanceof HTMLTextAreaElement || target.isContentEditable
}

export function NativeMenuBlocker() {
  useEffect(() => {
    const handler = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        event.preventDefault()
        return
      }
      if (isTextTarget(target)) return
      event.preventDefault()
    }
    document.addEventListener('contextmenu', handler)
    return () => document.removeEventListener('contextmenu', handler)
  }, [])

  return null
}
