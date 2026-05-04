import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'

interface SlashCommandItem {
  title: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  command: (props: { editor: any; range: { from: number; to: number } }) => void
}

const slashCommands: SlashCommandItem[] = [
  {
    title: '段落',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setParagraph().run()
    },
  },
  {
    title: '一级标题',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run()
    },
  },
  {
    title: '二级标题',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run()
    },
  },
  {
    title: '三级标题',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run()
    },
  },
  {
    title: '无序列表',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: '有序列表',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    title: '待办列表',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run()
    },
  },
  {
    title: '引用块',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    title: '分割线',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
  },
  {
    title: '图片占位',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('imagePlaceholder').run()
    },
  },
  {
    title: '表格',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3 }).run()
    },
  },
]

function renderItems(
  container: HTMLElement,
  items: SlashCommandItem[],
  selected: number,
  command: (item: SlashCommandItem) => void,
) {
  items.forEach((item, index) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `flex w-full items-center rounded-sm px-3 py-1.5 text-left text-sm transition-colors hover:bg-paper-alt ${
      index === selected ? 'bg-paper-card text-ink' : 'text-ink'
    }`
    btn.textContent = item.title
    btn.addEventListener('click', () => command(item))
    btn.addEventListener('mousedown', (e) => e.preventDefault())
    container.appendChild(btn)
  })
}

function filterItems(query: string): SlashCommandItem[] {
  if (!query) return slashCommands
  const q = query.toLowerCase()
  return slashCommands.filter((item) => item.title.toLowerCase().includes(q))
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    let popup: HTMLElement | null = null
    let selectedIndex = 0
    let currentItems: SlashCommandItem[] = []
    let currentCommand: ((item: SlashCommandItem) => void) | null = null

    return [
      Suggestion<SlashCommandItem>({
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        items: ({ query }) => {
          return filterItems(query)
        },
        command: ({ editor, range, props }) => {
          props.command({ editor, range })
        },
        render: () => ({
          onStart: (props: SuggestionProps<SlashCommandItem>) => {
            if (props.items.length === 0) return
            currentItems = props.items
            currentCommand = props.command

            popup = document.createElement('div')
            popup.className =
              'absolute z-50 max-h-48 overflow-auto rounded-md border border-line bg-paper p-1 shadow-none ring-1 ring-black/5 min-w-[180px]'

            const rect = props.clientRect?.()
            if (rect) {
              popup.style.left = `${rect.left}px`
              popup.style.top = `${rect.bottom + 4}px`
            }

            selectedIndex = 0
            renderItems(popup, currentItems, selectedIndex, props.command)
            document.body.appendChild(popup)
          },

          onUpdate: (props: SuggestionProps<SlashCommandItem>) => {
            currentItems = props.items
            currentCommand = props.command
            if (!popup || currentItems.length === 0) {
              popup?.remove()
              popup = null
              return
            }

            const rect = props.clientRect?.()
            if (rect) {
              popup.style.left = `${rect.left}px`
              popup.style.top = `${rect.bottom + 4}px`
            }

            selectedIndex = Math.min(selectedIndex, currentItems.length - 1)
            popup.innerHTML = ''
            renderItems(popup, currentItems, selectedIndex, props.command)
          },

          onExit: () => {
            popup?.remove()
            popup = null
          },

          onKeyDown: (props: SuggestionKeyDownProps) => {
            if (!popup) return false

            if (props.event.key === 'ArrowDown') {
              selectedIndex = Math.min(selectedIndex + 1, currentItems.length - 1)
              popup!.innerHTML = ''
              renderItems(popup!, currentItems, selectedIndex, currentCommand!)
              return true
            }

            if (props.event.key === 'ArrowUp') {
              selectedIndex = Math.max(selectedIndex - 1, 0)
              popup!.innerHTML = ''
              renderItems(popup!, currentItems, selectedIndex, currentCommand!)
              return true
            }

            if (props.event.key === 'Enter') {
              const item = currentItems[selectedIndex]
              if (item) {
                currentCommand!(item)
                return true
              }
            }

            if (props.event.key === 'Escape') {
              popup?.remove()
              popup = null
              return true
            }

            return false
          },
        }),
      }),
    ]
  },
})
