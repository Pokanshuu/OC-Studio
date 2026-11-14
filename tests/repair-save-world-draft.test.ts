import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Editor } from '@tiptap/core'
import type { WorldEntry } from '@/types'

/**
 * 词条草稿的正式回归（F03 草稿侧 / F04 的正文修订契约）。
 *
 * 重点不是「正常保存一次」，而是：
 * - 保存失败必须向上传递（离场屏障能拦住关闭 / 换库），草稿不能丢；
 * - await 期间又输入的新草稿要保留，下一轮继续写；
 * - 写入串行，旧草稿不能覆盖新草稿。
 */

const mocks = vi.hoisted(() => ({
  saveEntryContent: vi.fn(),
  syncReferenceLabels: vi.fn(async (doc: unknown) => doc),
  notifyDataUpdated: vi.fn(),
  bodyDocFromMarkdown: vi.fn(() => ({ type: 'doc', content: [] })),
}))

vi.mock('@/features/world/services', () => ({
  saveEntryContent: mocks.saveEntryContent,
}))
vi.mock('@/lib/reference-sync', () => ({
  syncReferenceLabels: mocks.syncReferenceLabels,
}))
vi.mock('@/lib/vault/write-body', () => ({
  bodyDocFromMarkdown: mocks.bodyDocFromMarkdown,
}))
vi.mock('@/lib/data-events', () => ({
  notifyDataUpdated: mocks.notifyDataUpdated,
}))

import { useWorldEntryDraft } from '@/features/world/hooks/useWorldEntryDraft'
import { flushPendingSaves, PendingSaveError } from '@/lib/pending-saves'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function entryFixture(): WorldEntry {
  return {
    id: 1,
    title: '测试词条',
    content: '',
    document: { type: 'doc', content: [] },
    category: '',
    parentId: null,
    order: 0,
    isConcept: false,
    relations: [],
    references: [],
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    deleted: false,
    _syncStatus: 'synced',
    _lastModified: 1,
  }
}

function docA(): Record<string, unknown> {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] }
}

function docB(): Record<string, unknown> {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] }
}

interface Draft {
  handleContentChange: (html: string) => void
  handleTitleChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  handleEditorReady: (editor: Editor) => void
  flushSave: () => Promise<void>
}

function fakeEditor(getJson: () => Record<string, unknown>) {
  const chain = {
    setContent: () => chain,
    command: () => chain,
    run: () => true,
  }
  return {
    getJSON: getJson,
    chain: () => chain,
  } as unknown as Editor
}

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mocks.saveEntryContent.mockResolvedValue(undefined)
})

afterEach(async () => {
  if (root !== null) {
    await act(async () => {
      root?.unmount()
    })
  }
  root = null
  container?.remove()
  container = null
  vi.useRealTimers()
})

async function mountDraft(onReady: (draft: Draft) => void): Promise<void> {
  let draft: Draft | null = null
  const refresh = vi.fn()
  function Probe() {
    const [title, setTitle] = React.useState('测试词条')
    draft = useWorldEntryDraft({
      selectedId: 1,
      currentEntry: entryFixture(),
      refresh,
      title,
      setTitle,
    }) as unknown as Draft
    return null
  }

  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(React.createElement(Probe))
  })
  if (draft === null) throw new Error('draft 未挂载')
  await act(async () => {
    // 装载后有 300ms 静默期（防「刚 setContent 就被当成用户编辑」）
    await vi.advanceTimersByTimeAsync(400)
  })
  onReady(draft)
}

describe('useWorldEntryDraft', () => {
  test('保存失败向上传递，草稿保留；重试成功后才清掉', async () => {
    let draft: Draft | null = null
    mocks.saveEntryContent.mockRejectedValue(new Error('词条写盘失败'))
    const current = docA()

    await mountDraft((value) => {
      draft = value
    })
    const editor = fakeEditor(() => current)
    await act(async () => {
      draft?.handleEditorReady(editor)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })

    await act(async () => {
      draft?.handleContentChange('<p>A</p>')
    })

    let failure: unknown
    await act(async () => {
      failure = await draft?.flushSave().catch((reason: unknown) => reason)
    })
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toContain('词条写盘失败')

    // 离场屏障也必须看到这次失败（不能吞掉）
    let barrierError: unknown
    await act(async () => {
      barrierError = await flushPendingSaves().catch((reason: unknown) => reason)
    })
    expect(barrierError).toBeInstanceOf(PendingSaveError)

    // 故障解除后，同一份草稿可以原样重试
    mocks.saveEntryContent.mockResolvedValue(undefined)
    await act(async () => {
      await flushPendingSaves()
    })
    expect(mocks.saveEntryContent.mock.calls.length).toBeGreaterThanOrEqual(3)
    const lastCall = mocks.saveEntryContent.mock.calls.at(-1)
    expect(lastCall?.[2]).toEqual(docA())
  })

  test('await 期间的新草稿保留，下一轮写入新版本（旧版本不会覆盖新版本）', async () => {
    let draft: Draft | null = null
    let current = docA()
    let release: () => void = () => {}

    await mountDraft((value) => {
      draft = value
    })
    const editor = fakeEditor(() => current)
    await act(async () => {
      draft?.handleEditorReady(editor)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })

    await act(async () => {
      draft?.handleContentChange('<p>A</p>')
    })

    mocks.saveEntryContent.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )

    let first: Promise<void> = Promise.resolve()
    await act(async () => {
      first = draft?.flushSave() ?? Promise.resolve()
      await Promise.resolve()
    })

    // 第一次写入还没结束，用户继续输入 B
    current = docB()
    await act(async () => {
      draft?.handleContentChange('<p>B</p>')
    })

    await act(async () => {
      release()
      await first
    })

    // B 仍然是待写草稿，不能被 A 的成功回执清掉
    await act(async () => {
      await draft?.flushSave()
    })

    expect(mocks.saveEntryContent).toHaveBeenCalledTimes(2)
    expect(mocks.saveEntryContent.mock.calls[0]?.[2]).toEqual(docA())
    expect(mocks.saveEntryContent.mock.calls[1]?.[2]).toEqual(docB())
  })
})
