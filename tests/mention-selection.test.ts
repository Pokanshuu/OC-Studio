import { expect, test, vi } from 'vitest'
import type { Editor } from '@tiptap/core'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import type { ReferableEntity } from '@/lib/reference-registry'

vi.mock('@/lib/image-service', () => ({ getImageUrl: () => '', getDefaultImage: () => '' }))

import { createMentionRender } from '@/components/editor/mention-render'

test('mention keyboard selection follows visible grouped rows on start and update', () => {
  const command = vi.fn()
  const items: ReferableEntity[] = [
    { type: 'country', id: '1', name: '阿国', keywords: [] },
    { type: 'character', id: '2', name: '乙角色', keywords: [] },
    { type: 'event', id: '3', name: '丙事件', keywords: [] },
  ]
  const render = createMentionRender()()
  const props = (values: ReferableEntity[]) => ({
    items: values, command,
    range: { from: 1, to: 2 }, query: '', text: '@', decorationNode: document.createElement('span'),
    editor: { view: { composing: false } } as unknown as Editor,
    clientRect: () => new DOMRect(30, 30, 10, 16),
  }) as SuggestionProps<ReferableEntity>
  const key = (value: string) => render.onKeyDown({
    event: new KeyboardEvent('keydown', { key: value }),
  } as SuggestionKeyDownProps)
  const selectedText = () => [...document.querySelectorAll<HTMLElement>(
    '[data-oc-popup="mention"] [data-mention-index]',
  )].find((row) => row.classList.contains('bg-[var(--oc-hover)]'))?.textContent
  render.onStart(props(items))
  try {
    let highlighted = selectedText()
    key('Enter')
    expect(highlighted).toContain(command.mock.lastCall?.[0].name)
    key('ArrowDown')
    highlighted = selectedText()
    key('Enter')
    expect(highlighted).toContain(command.mock.lastCall?.[0].name)
    render.onUpdate(props([items[2], items[0], items[1]]))
    highlighted = selectedText()
    key('Enter')
    expect(highlighted).toContain(command.mock.lastCall?.[0].name)
  } finally {
    render.onExit()
  }
})
