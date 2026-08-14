import Mention from '@tiptap/extension-mention'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import type { Editor } from '@tiptap/core'
import { searchAllEntitiesFlat } from '@/lib/reference-registry'
import { adjustSuggestionPosition } from '@/lib/menu-utils'
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
      popup.className = 'absolute z-50 max-h-56 overflow-auto rounded-md border border-line bg-paper p-1 shadow-none ring-1 ring-black/5 min-w-[180px]'
      const rect = props.clientRect()
      if (rect) {
        popup.style.left = `${rect.left}px`
        popup.style.top = `${rect.bottom + 4}px`
      }
      renderWikiItems(popup, props.items, props.command, 0)
      document.body.appendChild(popup)
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
      renderWikiItems(popup, props.items, props.command, selectedIndex)
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
    btn.className = `flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-left text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${isSelected ? 'bg-black/5 dark:bg-white/5 text-ink' : 'text-ink'}`

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

export const WikiLinkExtension = Mention.extend({
  name: 'wikiLink',

  addAttributes() {
    return {
      ...this.parent?.(),
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="wiki-link"]' }]
  },
}).configure({
  HTMLAttributes: {
    class: 'inline-flex bg-paper-alt border border-line rounded px-1.5 text-sm text-ink cursor-pointer underline decoration-ink-faint decoration-dotted hover:decoration-ink',
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
