'use client'

/**
 * 「@ 引用」下拉的**原生 DOM 渲染器**。
 *
 * 为什么不用 React：这个弹层挂在 TipTap 的 suggestion 生命周期里（每次输入都要
 * 重新定位/重建），走 React 会与编辑器的同步渲染打架；原生 DOM + 手动定位更可控。
 * 因此这里保留命令式写法，单独成模块以便与编辑器主组件解耦。
 */

import type { Editor } from '@tiptap/core'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import type { ReferableEntity } from '@/lib/reference-registry'
import { adjustSuggestionPosition } from '@/lib/menu-utils'
import { getImageUrl, getDefaultImage } from '@/lib/image-service'

export interface ExtendedReferableEntity extends ReferableEntity {
  label: string
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  character: '角色',
  event: '事件',
  country: '国家',
}

export function createMentionRender() {
  let popup: HTMLElement | null = null
  let ac: AbortController | null = null
  let selectedIndex = 0
  let currentItems: ReferableEntity[] = []
  let currentCommand: ((item: ReferableEntity) => void) | null = null

  const isComposing = (editor: Editor): boolean => {
    return (editor as unknown as { view: { composing: boolean } }).view?.composing ?? false
  }

  return () => ({
    onStart: (props: SuggestionProps<ReferableEntity>) => {
      if (!props.clientRect || props.items.length === 0) return
      if (isComposing(props.editor)) return
      ac?.abort()
      ac = new AbortController()
      currentItems = props.items
      currentCommand = props.command
      selectedIndex = 0
      popup = document.createElement('div')
      popup.className = 'pointer-events-auto fixed z-50 max-h-56 overflow-auto border border-line bg-paper/85 p-1 shadow-none backdrop-blur-lg min-w-[200px] dark:bg-paper/85'
      const rect = props.clientRect()
      if (rect) {
        popup.style.left = `${rect.left}px`
        popup.style.top = `${rect.bottom + 4}px`
      }
      renderMentionGroups(popup, props.items, props.command, 0)
      ;(document.getElementById('overlay-root') ?? document.body).appendChild(popup)
      document.addEventListener('pointerdown', (e) => {
        if (popup && !popup.contains(e.target as Node)) {
          popup.remove()
          popup = null
          ac?.abort()
        }
      }, { signal: ac.signal, capture: true })
      if (rect) {
        requestAnimationFrame(() => {
          if (!popup) return
          const adjusted = adjustSuggestionPosition(rect, popup.offsetWidth, popup.offsetHeight)
          popup.style.left = `${adjusted.x}px`
          popup.style.top = `${adjusted.y}px`
        })
      }
    },
    onUpdate: (props: SuggestionProps<ReferableEntity>) => {
      if (isComposing(props.editor)) return
      if (!popup || props.items.length === 0) { popup?.remove(); popup = null; ac?.abort(); return }
      currentItems = props.items
      currentCommand = props.command
      selectedIndex = Math.min(selectedIndex, props.items.length - 1)
      const rect = props.clientRect?.()
      if (rect) {
        popup.style.left = `${rect.left}px`
        popup.style.top = `${rect.bottom + 4}px`
      }
      popup.innerHTML = ''
      renderMentionGroups(popup, props.items, props.command, selectedIndex)
      if (rect) {
        const adjusted = adjustSuggestionPosition(rect, popup.offsetWidth, popup.offsetHeight)
        popup.style.left = `${adjusted.x}px`
        popup.style.top = `${adjusted.y}px`
      }
    },
    onExit: (props: SuggestionProps<ReferableEntity>) => {
      if (isComposing(props.editor)) return
      ac?.abort()
      ac = null
      popup?.remove()
      popup = null
    },
    onKeyDown: (props: SuggestionKeyDownProps) => {
      if (props.event.key === 'Escape') { popup?.remove(); popup = null; ac?.abort(); return true }
      if (props.event.key === 'ArrowDown') {
        selectedIndex = Math.min(selectedIndex + 1, currentItems.length - 1)
        if (popup) {
          popup.innerHTML = ''
          renderMentionGroups(popup, currentItems, currentCommand!, selectedIndex)
        }
        return true
      }
      if (props.event.key === 'ArrowUp') {
        selectedIndex = Math.max(selectedIndex - 1, 0)
        if (popup) {
          popup.innerHTML = ''
          renderMentionGroups(popup, currentItems, currentCommand!, selectedIndex)
        }
        return true
      }
      if (props.event.key === 'Enter') {
        const item = currentItems[selectedIndex]
        if (item && currentCommand) {
          currentCommand(item)
          return true
        }
      }
      return false
    },
  })
}

function renderMentionGroups(
  container: HTMLElement,
  items: ReferableEntity[],
  command: (item: ReferableEntity) => void,
  selectedIndex = -1,
) {
  let globalIdx = 0
  const groups: Record<string, ReferableEntity[]> = {}
  for (const item of items) {
    if (!groups[item.type]) groups[item.type] = []
    groups[item.type].push(item)
  }
  const orderedTypes = Object.keys(groups).sort()
  for (const type of orderedTypes) {
    if (orderedTypes.length > 1) {
      const hdr = document.createElement('div')
      hdr.className = 'px-3 py-1.5 text-xs font-medium text-ink-faint'
      hdr.textContent = ENTITY_TYPE_LABELS[type] ?? type
      container.appendChild(hdr)
    }
    for (const item of groups[type]) {
      const isSelected = globalIdx === selectedIndex
      globalIdx++
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = `flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-[var(--oc-hover)] ${isSelected ? 'bg-[var(--oc-hover)] text-ink' : 'text-ink'}`

      if (item.type === 'character' || item.type === 'country') {
        const avatarType = item.type === 'country' ? 'flag' : 'avatar'
        const img = document.createElement('img')
        img.src = getImageUrl(item.avatarUrl, avatarType)
        img.alt = ''
        img.className = 'w-5 h-5 rounded-full object-cover shrink-0 border border-line'
        img.onerror = () => { img.src = getDefaultImage(avatarType) }
        btn.appendChild(img)
      }

      const nameSpan = document.createElement('span')
      nameSpan.className = 'truncate'
      nameSpan.textContent = item.name
      btn.appendChild(nameSpan)

      const typeSpan = document.createElement('span')
      typeSpan.className = 'ml-auto shrink-0 text-xs text-ink-faint'
      typeSpan.textContent = ENTITY_TYPE_LABELS[item.type] ?? item.type
      btn.appendChild(typeSpan)

      btn.addEventListener('click', () => command(item))
      btn.addEventListener('mousedown', (e) => e.preventDefault())
      container.appendChild(btn)
    }
  }
}



