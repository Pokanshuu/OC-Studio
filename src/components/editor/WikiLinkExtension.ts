import Mention from '@tiptap/extension-mention'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import type { Editor } from '@tiptap/core'
import { searchAllEntitiesFlat } from '@/lib/reference-registry'
import { adjustSuggestionPosition } from '@/lib/menu-utils'
import { MENU, MENU_ITEM_BASE } from '@/lib/ui-tokens'
import type { ReferableEntity } from '@/lib/reference-registry'

const isComposing = (editor: Editor): boolean => {
  return (editor as unknown as { view: { composing: boolean } }).view?.composing ?? false
}

function createWikiLinkRender() {
  let popup: HTMLElement | null = null
  let ac: AbortController | null = null
  let selectedIndex = 0
  let currentItems: ReferableEntity[] = []
  let currentCommand: ((item: ReferableEntity) => void) | null = null

  /**
   * 关闭的唯一实现：节点和「点外部关闭」监听必须一起收掉。
   * 之前的写法在 onStart 里只 `ac?.abort()` 就把 popup 换成新节点，
   * 旧节点留在 DOM 里、监听已被 abort —— 于是它再也关不掉，卡在坐标 (0,0) 那一份上。
   */
  const closePopup = () => {
    ac?.abort()
    ac = null
    if (popup) {
      popup.remove()
      popup = null
    }
  }

  // 编辑器销毁 / 装饰节点已脱离文档时，clientRect() 会退化成全 0 的矩形，
  // 按它摆出来的菜单就会贴在左上角。宁可不弹，也不弹一个飘在角落的死菜单。
  const isDegenerateRect = (rect: DOMRect): boolean =>
    rect.width === 0 && rect.height === 0

  const mountRoot = (): HTMLElement =>
    document.getElementById('overlay-root') ?? document.body

  return () => ({
    onStart: (props: SuggestionProps<ReferableEntity>) => {
      if (!props.clientRect || props.items.length === 0) return
      if (isComposing(props.editor)) return
      const rect = props.clientRect()
      if (!rect || isDegenerateRect(rect)) return
      closePopup()
      ac = new AbortController()
      currentItems = props.items
      currentCommand = props.command
      selectedIndex = 0
      popup = document.createElement('div')
      popup.dataset.ocPopup = 'wiki'
      popup.className = `pointer-events-auto fixed z-50 max-h-56 overflow-auto min-w-[180px] ${MENU}`
      popup.style.left = `${rect.left}px`
      popup.style.top = `${rect.bottom + 4}px`
      renderWikiItems(popup, props.items, props.command, 0)
      mountRoot().appendChild(popup)
      document.addEventListener('pointerdown', (e) => {
        if (popup && !popup.contains(e.target as Node)) closePopup()
      }, { signal: ac.signal, capture: true })
      requestAnimationFrame(() => {
        if (!popup) return
        const adjusted = adjustSuggestionPosition(rect, popup.offsetWidth, popup.offsetHeight)
        popup.style.left = `${adjusted.x}px`
        popup.style.top = `${adjusted.y}px`
      })
    },
    onUpdate: (props: SuggestionProps<ReferableEntity>) => {
      if (isComposing(props.editor)) return
      if (!popup || props.items.length === 0) { closePopup(); return }
      const rect = props.clientRect?.()
      if (!rect || isDegenerateRect(rect)) { closePopup(); return }
      currentItems = props.items
      currentCommand = props.command
      selectedIndex = Math.min(selectedIndex, props.items.length - 1)
      popup.innerHTML = ''
      renderWikiItems(popup, props.items, props.command, selectedIndex)
      if (rect) {
        const adjusted = adjustSuggestionPosition(rect, popup.offsetWidth, popup.offsetHeight)
        popup.style.left = `${adjusted.x}px`
        popup.style.top = `${adjusted.y}px`
      }
    },
    onExit: () => {
      closePopup()
    },
    onKeyDown: (props: SuggestionKeyDownProps) => {
      if (props.event.key === 'Escape') { closePopup(); return true }
      if (props.event.key === 'ArrowDown') {
        selectedIndex = Math.min(selectedIndex + 1, currentItems.length - 1)
        if (popup) {
          popup.innerHTML = ''
          renderWikiItems(popup, currentItems, currentCommand!, selectedIndex)
        }
        return true
      }
      if (props.event.key === 'ArrowUp') {
        selectedIndex = Math.max(selectedIndex - 1, 0)
        if (popup) {
          popup.innerHTML = ''
          renderWikiItems(popup, currentItems, currentCommand!, selectedIndex)
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

function renderWikiItems(
  container: HTMLElement,
  items: ReferableEntity[],
  command: (item: ReferableEntity) => void,
  selectedIndex = -1,
) {
  items.forEach((item, index) => {
    const isSelected = index === selectedIndex
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `${MENU_ITEM_BASE} ${isSelected ? 'bg-[var(--oc-hover)] text-ink' : 'text-ink'}`

    const nameSpan = document.createElement('span')
    nameSpan.className = 'truncate'
    nameSpan.textContent = item.name
    btn.appendChild(nameSpan)

    const typeSpan = document.createElement('span')
    typeSpan.className = 'ml-auto shrink-0 text-xs text-ink-faint'
    typeSpan.textContent = '词条'
    btn.appendChild(typeSpan)

    btn.addEventListener('click', () => command(item))
    btn.addEventListener('mousedown', (e) => e.preventDefault())
    container.appendChild(btn)
  })
}

/**
 * 每个编辑器实例各建一份，不要把结果提升成模块常量。
 *
 * `createWikiLinkRender()` 的状态（popup / AbortController 等）活在闭包里；
 * 曾经这里是一个模块级的 `WikiLinkExtension` 常量，所有编辑器共用同一份状态 ——
 * A 编辑器开菜单、B 编辑器再开菜单时，B 的 onStart 会 abort 掉 A 的「点外部关闭」
 * 监听并把 popup 指针换成新节点，A 那个节点就永久留在 DOM 里（还停在 (0,0)）。
 * @ 引用那边一直是按实例建的（editor-config 里就地调用），这里对齐。
 */
export function createWikiLinkExtension() {
  return Mention.extend({
    name: 'wikiLink',

    addAttributes() {
      return {
        ...this.parent?.(),
        // 与 Mention 一致：[[ ]] 的原文（可能含 `#锚点` 或 `|别名`）另存一份，
        // 写回 vault 时逐字还原，避免带锚点的链接被改写成裸链接。
        raw: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-raw'),
          renderHTML: (attributes) => (attributes.raw ? { 'data-raw': attributes.raw } : {}),
        },
      }
    },

    parseHTML() {
      return [{ tag: 'span[data-type="wiki-link"]' }]
    },
  }).configure({
    HTMLAttributes: {
      class: 'inline-flex bg-paper-alt border border-line rounded-item px-1.5 text-sm text-ink cursor-pointer underline decoration-ink-faint decoration-dotted hover:decoration-ink',
    },
    renderHTML({ options, node }) {
      const cls = options.HTMLAttributes?.class ?? ''
      const label = (node.attrs.label as string) ?? ''
      return [
        'span',
        {
          class: cls,
          'data-type': 'wiki-link',
          'data-id': node.attrs.id as string ?? '',
          'data-label': label,
        },
        label,
      ]
    },
    suggestion: {
      char: '[[',
      items: async ({ query }) => {
        const entities = await searchAllEntitiesFlat(query)
        return entities.filter((e) => e.type === 'world').map((e) => ({ ...e, label: e.name }))
      },
      render: createWikiLinkRender(),
      command: ({ editor, range, props }) => {
        const p = props as ReferableEntity & { label: string }
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({
            type: 'wikiLink',
            attrs: {
              id: p.id,
              label: p.label ?? p.name,
            },
          })
          .run()
      },
    },
  })
}
