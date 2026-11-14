import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Editor } from '@tiptap/core'
import type { WorldEntry } from '@/types'

/**
 * 第二轮 CODEX Q04 的正式回归。
 *
 * 与冻结探针同一手法，但补全了探针没覆盖的部分：
 * - fakeEditor.setContent **真的**修改模拟文档；
 * - refresh **真的**更新 currentEntry（updatedAt + document）；
 * - 保存回执、真正外部修改、换条目三种情况分别断言；
 * - 继续输入 C、保存、重新装载后内容仍是 C。
 */

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  syncReferenceLabels: vi.fn(async (doc: unknown) => doc),
  notifyDataUpdated: vi.fn(),
  bodyDocFromMarkdown: vi.fn(() => ({ type: 'doc', content: [] })),
}))

vi.mock('@/features/world/services', () => ({ saveEntryContent: mocks.save }))
vi.mock('@/lib/reference-sync', () => ({ syncReferenceLabels: mocks.syncReferenceLabels }))
vi.mock('@/lib/vault/write-body', () => ({ bodyDocFromMarkdown: mocks.bodyDocFromMarkdown }))
vi.mock('@/lib/data-events', () => ({ notifyDataUpdated: mocks.notifyDataUpdated }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

import { useWorldEntryDraft } from '@/features/world/hooks/useWorldEntryDraft'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Json = Record<string, unknown>

function doc(text: string): Json {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
}

function textOf(value: Json): string {
  const content = value.content as Array<{ content?: Array<{ text?: string }> }> | undefined
  return content?.[0]?.content?.[0]?.text ?? ''
}

interface FakeEditor {
  getJSON: () => Json
  chain: () => FakeChain
  current: () => Json
  commandCalls: number
}

interface FakeChain {
  setContent: (value: Json) => FakeChain
  command: (callback: (props: { tr: { setMeta: () => void } }) => boolean) => FakeChain
  run: () => boolean
}

function fakeEditor(initial: Json): FakeEditor {
  let current = structuredClone(initial)
  const editor: FakeEditor = {
    getJSON: () => structuredClone(current),
    current: () => structuredClone(current),
    chain: () => chain,
    commandCalls: 0,
  }
  const chain: FakeChain = {
    setContent(value) {
      // 真的改文档：探针里这一步是假的，所以看不到回灌
      current = structuredClone(value)
      return chain
    },
    command(callback) {
      callback({ tr: { setMeta: () => {} } })
      editor.commandCalls += 1
      return chain
    },
    run: () => true,
  }
  return editor
}

interface TestEntry extends WorldEntry {
  updatedAt: number
}

function makeEntry(id: number, document: Json): TestEntry {
  return {
    id,
    title: '笔记',
    content: '',
    document,
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

interface Draft {
  handleContentChange: (html: string) => void
  handleEditorReady: (editor: Editor) => void
  flushSave: () => Promise<void>
}

interface Controls {
  setExternal: (entryId: number, document: Json) => void
  setSelected: (entryId: number) => void
}

let root: Root | null = null
let container: HTMLDivElement | null = null

async function mount(
  initialEntryId: number,
  initialDocument: Json,
  entries: Record<number, Json>,
  saved: { current: Json },
  onDraft: (draft: Draft) => void,
  controls: Controls,
): Promise<void> {
  function Probe({ savedValue }: { savedValue: { current: Json } }) {
    const [allEntries, setAllEntries] = React.useState<Record<number, TestEntry>>(() => {
      const result: Record<number, TestEntry> = {}
      for (const [id, document] of Object.entries(entries)) {
        result[Number(id)] = makeEntry(Number(id), document)
      }
      result[initialEntryId] = makeEntry(initialEntryId, initialDocument)
      return result
    })
    const [selectedId, setSelectedId] = React.useState(initialEntryId)
    const [title, setTitle] = React.useState('笔记')

    // 真的更新 currentEntry：查询回传刚保存的版本（或测试注入的外部版本）
    const refresh = React.useCallback(() => {
      setAllEntries((previous) => ({
        ...previous,
        [selectedId]: {
          ...previous[selectedId]!,
          updatedAt: previous[selectedId]!.updatedAt + 1,
          document: structuredClone(savedValue.current),
        },
      }))
    }, [selectedId, savedValue])

    controls.setExternal = (entryId, document) => {
      setAllEntries((previous) => ({
        ...previous,
        [entryId]: {
          ...previous[entryId]!,
          updatedAt: previous[entryId]!.updatedAt + 1,
          document: structuredClone(document),
        },
      }))
    }
    controls.setSelected = (entryId) => setSelectedId(entryId)

    const draft = useWorldEntryDraft({
      selectedId,
      currentEntry: allEntries[selectedId],
      refresh,
      title,
      setTitle,
    })
    onDraft(draft as unknown as Draft)
    return null
  }

  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(React.createElement(Probe, { savedValue: saved }))
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})

afterEach(async () => {
  if (root !== null) {
    await act(async () => {
      root?.unmount()
    })
    root = null
  }
  container?.remove()
  container = null
  vi.useRealTimers()
})

async function ready(
  draft: Draft,
  editor: FakeEditor,
): Promise<void> {
  await act(async () => {
    draft.handleEditorReady(editor as unknown as Editor)
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400)
  })
}

describe('Q04 自身保存回执不得覆盖脏草稿', () => {
  test('a clean external restore may equal an older own save with a different revision', async () => {
    let draft!: Draft
    const controls = {} as Controls
    const saved = { current: doc('原文') }
    const editor = fakeEditor(doc('原文'))
    await mount(1, doc('原文'), {}, saved, (value) => { draft = value }, controls)
    await ready(draft, editor)
    let revision = 1
    mocks.save.mockImplementation(async (_id: number, _title: string, value: Json) => {
      saved.current = structuredClone(value)
      return { updatedAt: ++revision }
    })
    for (const text of ['版本A', '版本B']) {
      editor.chain().setContent(doc(text))
      await act(async () => { draft.handleContentChange('') })
      await act(async () => { await draft.flushSave() })
    }
    await act(async () => { controls.setExternal(1, doc('外部新版本')) })
    expect(textOf(editor.current())).toBe('外部新版本')
    await act(async () => { controls.setExternal(1, doc('版本A')) })
    expect(textOf(editor.current())).toBe('版本A')
  })

  test('保存 A 期间输入 B：回执 A 不回灌；继续输入 C 保存重开后仍是 C', async () => {
    let draft!: Draft
    const controls = {} as Controls
    const saved = { current: doc('原文') }
    const editor = fakeEditor(doc('原文'))

    await mount(1, doc('原文'), {}, saved, (value) => {
      draft = value
    }, controls)
    await ready(draft, editor)

    // 默认保存：立即写进“磁盘”（refresh 会回传它）
    mocks.save.mockImplementation(async (_id: number, _title: string, value: Json) => {
      saved.current = structuredClone(value)
    })

    // 输入 A 并保存（延迟到测试释放）
    editor.chain().setContent(doc('版本A'))
    await act(async () => {
      draft.handleContentChange('')
    })

    let release: () => void = () => {}
    mocks.save.mockImplementationOnce(
      (_id: number, _title: string, value: Json) =>
        new Promise<void>((resolve) => {
          release = () => {
            saved.current = structuredClone(value)
            resolve()
          }
        }),
    )
    let saving: Promise<void> = Promise.resolve()
    await act(async () => {
      saving = draft.flushSave()
      await Promise.resolve()
    })

    // await 期间继续输入 B
    editor.chain().setContent(doc('版本B'))
    await act(async () => {
      draft.handleContentChange('')
    })

    await act(async () => {
      release()
      await saving
    })

    // 回执 A 到达：可见内容必须仍是 B
    expect(textOf(editor.current())).toBe('版本B')
    expect(textOf(saved.current)).toBe('版本A')

    // B 仍在待写草稿里：计时器到点会继续保存
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })
    expect(textOf(saved.current)).toBe('版本B')
    expect(textOf(editor.current())).toBe('版本B')

    // 继续输入 C 并保存
    editor.chain().setContent(doc('版本C'))
    await act(async () => {
      draft.handleContentChange('')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })
    expect(textOf(saved.current)).toBe('版本C')
    expect(textOf(editor.current())).toBe('版本C')

    // 重新打开：用磁盘上的 C 作为初始文档，新编辑器必须显示 C
    await act(async () => {
      root?.unmount()
    })
    root = null
    container?.remove()
    container = null

    let reopened!: Draft
    const reopenControls = {} as Controls
    const reopenedEditor = fakeEditor(saved.current)
    await mount(1, structuredClone(saved.current), {}, { current: saved.current }, (value) => {
      reopened = value
    }, reopenControls)
    await ready(reopened, reopenedEditor)
    expect(textOf(reopenedEditor.current())).toBe('版本C')
    // 装载仍走 loadBodyWithoutHistory（command + addToHistory:false 的链）
    expect(reopenedEditor.commandCalls).toBeGreaterThan(0)
  })

  test('真正的外部修改：本地干净时采纳（不取消所有外部更新）', async () => {
    let draft!: Draft
    const controls = {} as Controls
    const saved = { current: doc('原文') }
    const editor = fakeEditor(doc('原文'))

    await mount(1, doc('原文'), {}, saved, (value) => {
      draft = value
    }, controls)
    await ready(draft, editor)
    expect(textOf(editor.current())).toBe('原文')

    await act(async () => {
      controls.setExternal(1, doc('外部版本'))
    })
    expect(textOf(editor.current())).toBe('外部版本')
  })

  test('真正的外部修改：本地有脏草稿时保留本地内容', async () => {
    let draft!: Draft
    const controls = {} as Controls
    const saved = { current: doc('原文') }
    const editor = fakeEditor(doc('原文'))

    await mount(1, doc('原文'), {}, saved, (value) => {
      draft = value
    }, controls)
    await ready(draft, editor)

    editor.chain().setContent(doc('本地草稿'))
    await act(async () => {
      draft.handleContentChange('')
    })
    await act(async () => {
      controls.setExternal(1, doc('外部版本'))
    })

    expect(textOf(editor.current())).toBe('本地草稿')
  })

  test('换回一条仍有未保存草稿的词条：显示草稿，而不是查询里的旧版本', async () => {
    let draft!: Draft
    const controls = {} as Controls
    const saved = { current: doc('第一条') }
    const editor = fakeEditor(doc('第一条'))

    await mount(
      1,
      doc('第一条'),
      { 2: doc('第二条') },
      saved,
      (value) => {
        draft = value
      },
      controls,
    )
    await ready(draft, editor)

    // 在第一条上输入但还没到自动保存时间
    editor.chain().setContent(doc('第一条草稿'))
    await act(async () => {
      draft.handleContentChange('')
    })

    // 切到第二条：装载第二条
    await act(async () => {
      controls.setSelected(2)
    })
    expect(textOf(editor.current())).toBe('第二条')

    // 切回第一条：必须显示尚未保存的草稿，而不是 currentEntry 里的旧“第一条”
    await act(async () => {
      controls.setSelected(1)
    })
    expect(textOf(editor.current())).toBe('第一条草稿')
  })
})
