import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Editor } from '@tiptap/core'
import type { Character, Country, Event } from '@/types'
import type { CountryFormData } from '@/features/countries/types'
import type { CharacterFormData } from '@/features/characters/types'
import type { EventFormData } from '@/features/events/types'
import type { RelationRow } from '@/components/shared/relations/types'
import type { SaveOutcome } from '@/lib/save-outcome'

/**
 * 编辑修订 / 自动保存 / 离场 flush 的正式回归（F04、F05、F03 的草稿侧）。
 *
 * 与审查探针同样的做法：跑真实 React hook，只替换列表数据、全局状态依赖和编辑器对象。
 * 覆盖的不只是「正常保存一次」：延迟保存期间继续输入、失败、多次交错、多个脏编辑器。
 */

const h = vi.hoisted(() => ({
  characters: [] as Array<Record<string, unknown>>,
  events: [] as Array<Record<string, unknown>>,
  countries: [] as Array<Record<string, unknown>>,
  markSaving: vi.fn(),
  registerSaveHandler: vi.fn(),
  reportDirty: vi.fn(),
}))

const vault = vi.hoisted(() => ({
  drain: vi.fn(),
  pending: 0,
  flushing: false,
}))

vi.mock('@/lib/vault/vault-persist', () => ({
  drainVaultWrites: vault.drain,
  currentStatus: () => ({
    pending: vault.pending,
    flushing: vault.flushing,
    lastError: null,
    lastFlushedAt: null,
  }),
}))

vi.mock('@/features/characters/hooks/useCharacters', () => ({
  useCharacterList: () => ({ characters: h.characters }),
}))
vi.mock('@/features/events/hooks/useEvents', () => ({
  useEventList: () => ({ events: h.events }),
}))
vi.mock('@/features/countries/hooks/useCountries', () => ({
  useCountryList: () => ({ countries: h.countries }),
}))
vi.mock('@/features/world/hooks/useWorldEntries', () => ({
  useCodexEntryList: () => ({ entries: [] }),
}))
vi.mock('@/components/layout/SaveStatusContext', () => ({
  useSaveStatus: () => h,
}))
vi.mock('@/components/layout/useEditorDirty', () => ({
  useEditorDirty: () => {},
}))
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

import { useCountryForm } from '@/features/countries/hooks/useCountryForm'
import { useCharacterForm } from '@/features/characters/hooks/useCharacterForm'
import { useEventForm } from '@/features/events/hooks/useEventForm'
import { flushPendingSaves, PendingSaveError } from '@/lib/pending-saves'
import { runSaveBarrier } from '@/lib/save-barrier'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type CountrySave = (id: number, data: Partial<CountryFormData>) => Promise<void>

interface FakeDoc {
  type: { name: string }
  content: { size: number }
  text: string
  eq: (other: FakeDoc) => boolean
  forEach: (fn: (child: FakeDoc) => void) => void
  toJSON: () => Record<string, unknown>
}

function fakeDoc(text: string): FakeDoc {
  const child: FakeDoc = {
    type: { name: 'paragraph' },
    content: { size: text.length },
    text,
    eq: (other) => other.text === text,
    forEach: () => {},
    toJSON: () => ({ type: 'paragraph', content: [{ type: 'text', text }] }),
  }
  return {
    type: { name: 'doc' },
    content: { size: text.length },
    text,
    eq: (other) => other.text === text,
    forEach: (fn) => fn(child),
    toJSON: () => ({ type: 'doc', content: [child.toJSON()] }),
  }
}

interface FakeEditor {
  state: { doc: FakeDoc }
  getJSON: () => Record<string, unknown>
}

function fakeEditor(text: string): FakeEditor {
  const editor: FakeEditor = {
    state: { doc: fakeDoc(text) },
    getJSON() {
      return editor.state.doc.toJSON()
    },
  }
  return editor
}

function countryFixture(): Country {
  return {
    id: 1,
    name: '测试国',
    parentId: null,
    description: '',
    system: '',
    geography: '',
    culture: '',
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    deleted: false,
    _syncStatus: 'synced',
    _lastModified: 1,
  }
}

function characterFixture(): Character {
  return {
    id: 1,
    name: '测试角色',
    aliases: [],
    race: '',
    element: '',
    occupation: '',
    faction: '',
    nationalityLegacy: '',
    height: '',
    birthday: '',
    avatarUrl: '',
    bio: '',
    lifeStory: '',
    relatedCharacters: [],
    gallery: [],
    avatars: [],
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    deleted: false,
    _syncStatus: 'synced',
    _lastModified: 1,
  }
}

function eventFixture(): Event {
  return {
    id: 1,
    title: '测试事件',
    time: '',
    location: '',
    summary: '',
    content: '',
    characters: [],
    parentEventId: null,
    relations: [],
    tags: [],
    images: [],
    isMajor: false,
    createdAt: 1,
    updatedAt: 1,
    deleted: false,
    _syncStatus: 'synced',
    _lastModified: 1,
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null

async function mount(node: React.ReactElement): Promise<void> {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(node)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  h.characters = []
  h.events = []
  h.countries = []
  vault.pending = 0
  vault.flushing = false
  vault.drain.mockReset()
  vault.drain.mockResolvedValue({
    written: 0,
    movedToTrash: 0,
    restored: 0,
    removed: 0,
    conflicts: [],
    errors: [],
  })
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

describe('国家表单：成员关系也进入保存与 dirty（F05）', () => {
  test('只添加相关角色也会自动保存，并把名单写进 payload', async () => {
    let form!: ReturnType<typeof useCountryForm>
    const onSave = vi.fn(async (_id: number, _data: Partial<CountryFormData>) => {})
    function Probe() {
      form = useCountryForm(countryFixture(), onSave)
      return null
    }

    await mount(React.createElement(Probe))
    await act(async () => {
      form?.addRelation('character', 7)
    })
    expect(form?.dirty).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600)
    })

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]?.[1]?.characters).toEqual([7])
    expect(form?.dirty).toBe(false)
  })

  test('只删除相关角色也会自动保存（清空名单）', async () => {
    h.characters = [{ id: 7, name: '七', aliases: [], countryId: 1 }]
    let form!: ReturnType<typeof useCountryForm>
    const onSave = vi.fn(async (_id: number, _data: Partial<CountryFormData>) => {})
    function Probe() {
      form = useCountryForm(countryFixture(), onSave)
      return null
    }

    await mount(React.createElement(Probe))
    await act(async () => {
      form?.removeRelation({ kind: 'character', index: 0 } as RelationRow)
    })
    expect(form?.dirty).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600)
    })

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]?.[1]?.characters).toEqual([])
  })

  test('R19 正式回归：慢保存期间输入保持 dirty，随后自动保存最后一版', async () => {
    let form!: ReturnType<typeof useCountryForm>
    const onSave = vi.fn(async (_id: number, _data: Partial<CountryFormData>) => {})
    function Probe() {
      form = useCountryForm(countryFixture(), onSave)
      return null
    }

    await mount(React.createElement(Probe))
    const editor = fakeEditor('原文') as unknown as Editor
    await act(async () => {
      form?.handleDocReady(editor)
    })
    ;(editor.state as unknown as { doc: FakeDoc }).doc = fakeDoc('版本 A')
    await act(async () => {
      form?.handleDocChange()
    })

    let release: () => void = () => {}
    onSave.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    let saving: Promise<void> = Promise.resolve()
    await act(async () => {
      saving = form?.handleSave() ?? Promise.resolve()
      await Promise.resolve()
    })

    ;(editor.state as unknown as { doc: FakeDoc }).doc = fakeDoc('版本 B')
    await act(async () => {
      form?.handleDocChange()
    })
    await act(async () => {
      release()
      await saving
    })

    // 保存的是 A；界面是 B —— 只确认被提交的那一版
    expect(onSave.mock.calls[0]?.[1]?.document).toEqual(fakeDoc('版本 A').toJSON())
    expect(form?.docDirty).toBe(true)

    // 新修订继续保存；最终磁盘版本必须是 B
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600)
    })
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onSave.mock.calls[1]?.[1]?.document).toEqual(fakeDoc('版本 B').toJSON())
    expect(form?.docDirty).toBe(false)
  })

  test('两次保存交错：后发起的修订排队，最终写入的是最后一版', async () => {
    let form!: ReturnType<typeof useCountryForm>
    const onSave = vi.fn(async (_id: number, _data: Partial<CountryFormData>) => {})
    function Probe() {
      form = useCountryForm(countryFixture(), onSave)
      return null
    }

    await mount(React.createElement(Probe))
    const editor = fakeEditor('原文') as unknown as Editor
    await act(async () => {
      form?.handleDocReady(editor)
    })
    ;(editor.state as unknown as { doc: FakeDoc }).doc = fakeDoc('版本 A')
    await act(async () => {
      form?.handleDocChange()
    })

    let releaseFirst: () => void = () => {}
    onSave.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve
        }),
    )

    let first: Promise<SaveOutcome> | undefined
    await act(async () => {
      first = form?.saveNow()
      await Promise.resolve()
    })
    ;(editor.state as unknown as { doc: FakeDoc }).doc = fakeDoc('版本 B')
    await act(async () => {
      form?.handleDocChange()
    })

    let second: Promise<SaveOutcome> | undefined
    await act(async () => {
      second = form?.saveNow()
      await Promise.resolve()
    })
    // 第二次还在排队：同一编辑器不允许两次提交并行
    expect(onSave).toHaveBeenCalledTimes(1)

    await act(async () => {
      releaseFirst()
      await first
      await second
    })

    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onSave.mock.calls[0]?.[1]?.document).toEqual(fakeDoc('版本 A').toJSON())
    expect(onSave.mock.calls[1]?.[1]?.document).toEqual(fakeDoc('版本 B').toJSON())
    expect(form?.docDirty).toBe(false)
  })

  test('第一次 flush 失败后草稿仍在，允许原样重试成功', async () => {
    let form!: ReturnType<typeof useCountryForm>
    const onSave = vi
      .fn<CountrySave>()
      .mockRejectedValueOnce(new Error('第一次写盘失败'))
      .mockResolvedValue(undefined)
    function Probe() {
      form = useCountryForm(countryFixture(), onSave)
      return null
    }

    await mount(React.createElement(Probe))
    await act(async () => {
      form?.addRelation('character', 7)
    })

    let firstError: unknown
    await act(async () => {
      firstError = await flushPendingSaves().catch((reason: unknown) => reason)
    })
    expect(firstError).toBeInstanceOf(PendingSaveError)
    expect(form?.dirty).toBe(true)

    await act(async () => {
      await flushPendingSaves()
    })
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onSave.mock.calls[1]?.[1]?.characters).toEqual([7])
    expect(form?.dirty).toBe(false)
  })

  test('干净时保存是空操作，不写盘也不产生假回执', async () => {
    let form!: ReturnType<typeof useCountryForm>
    const onSave = vi.fn(async (_id: number, _data: Partial<CountryFormData>) => {})
    function Probe() {
      form = useCountryForm(countryFixture(), onSave)
      return null
    }

    await mount(React.createElement(Probe))
    let outcome: SaveOutcome | undefined
    await act(async () => {
      outcome = await form.saveNow()
    })
    expect(outcome).toEqual({ status: 'clean' })
    expect(onSave).not.toHaveBeenCalled()
  })

  test('自动保存失败后保持 dirty，且不进入重试风暴', async () => {
    let form!: ReturnType<typeof useCountryForm>
    const onSave = vi.fn<CountrySave>(async () => {
      throw new Error('磁盘不可写')
    })
    function Probe() {
      form = useCountryForm(countryFixture(), onSave)
      return null
    }

    await mount(React.createElement(Probe))
    const editor = fakeEditor('原文') as unknown as Editor
    await act(async () => {
      form?.handleDocReady(editor)
    })
    ;(editor.state as unknown as { doc: FakeDoc }).doc = fakeDoc('未保存版本')
    await act(async () => {
      form?.handleDocChange()
    })

    // 第一次由 1.5s 自动保存触发并失败
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600)
    })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(form?.dirty).toBe(true)

    // R20 口径：失败后不自动重试，等用户再改 / 手动保存
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600 * 3)
    })
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  test('手动保存失败返回 failed 且保留 dirty', async () => {
    let form!: ReturnType<typeof useCountryForm>
    const onSave = vi.fn<CountrySave>(async () => {
      throw new Error('磁盘不可写')
    })
    function Probe() {
      form = useCountryForm(countryFixture(), onSave)
      return null
    }

    await mount(React.createElement(Probe))
    const editor = fakeEditor('原文') as unknown as Editor
    await act(async () => {
      form?.handleDocReady(editor)
    })
    ;(editor.state as unknown as { doc: FakeDoc }).doc = fakeDoc('未保存版本')
    await act(async () => {
      form?.handleDocChange()
    })

    let outcome: SaveOutcome | undefined
    await act(async () => {
      outcome = await form?.saveNow()
    })
    expect(outcome?.status).toBe('failed')
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(form?.dirty).toBe(true)
    expect(form?.docDirty).toBe(true)
  })
})

describe('角色 / 事件表单：同样的修订契约（F04）', () => {
  test('角色：慢保存期间输入，docDirty 保持 true 且基线是提交的那一版', async () => {
    let form!: ReturnType<typeof useCharacterForm>
    const onSave = vi.fn(async (_id: number, _data: Partial<CharacterFormData>) => {})
    function Probe() {
      form = useCharacterForm(characterFixture(), onSave)
      return null
    }

    await mount(React.createElement(Probe))
    const editor = fakeEditor('原文') as unknown as Editor
    await act(async () => {
      form?.handleDocReady(editor)
    })
    ;(editor.state as unknown as { doc: FakeDoc }).doc = fakeDoc('角色 A')
    await act(async () => {
      form?.handleDocChange()
    })

    let release: () => void = () => {}
    onSave.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    let saving: Promise<void> = Promise.resolve()
    await act(async () => {
      saving = form?.handleSave() ?? Promise.resolve()
      await Promise.resolve()
    })
    ;(editor.state as unknown as { doc: FakeDoc }).doc = fakeDoc('角色 B')
    await act(async () => {
      form?.handleDocChange()
    })
    await act(async () => {
      release()
      await saving
    })

    expect(onSave.mock.calls[0]?.[1]?.document).toEqual(fakeDoc('角色 A').toJSON())
    expect(form?.docDirty).toBe(true)
  })

  test('事件：编辑器未就绪时也不吞掉字段保存', async () => {
    let form!: ReturnType<typeof useEventForm>
    const onSave = vi.fn(async (_id: number, _data: Partial<EventFormData>) => {})
    function Probe() {
      form = useEventForm(eventFixture(), onSave)
      return null
    }

    await mount(React.createElement(Probe))
    await act(async () => {
      form.setTitle('改过的事件标题')
    })

    let outcome: SaveOutcome | undefined
    await act(async () => {
      outcome = await form.saveNow()
    })

    expect(outcome?.status).toBe('saved')
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]?.[1]?.title).toBe('改过的事件标题')
    expect(onSave.mock.calls[0]?.[1]?.document).toBeUndefined()
  })

  test('事件：慢保存期间输入，docDirty 保持 true 且基线是提交的那一版', async () => {
    let form!: ReturnType<typeof useEventForm>
    const onSave = vi.fn(async (_id: number, _data: Partial<EventFormData>) => {})
    function Probe() {
      form = useEventForm(eventFixture(), onSave)
      return null
    }

    await mount(React.createElement(Probe))
    const editor = fakeEditor('事件原文') as unknown as Editor
    await act(async () => {
      form?.handleEditorReady(editor)
    })
    ;(editor.state as unknown as { doc: FakeDoc }).doc = fakeDoc('事件 A')
    await act(async () => {
      form?.handleDocChange()
    })

    let release: () => void = () => {}
    onSave.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    let saving: Promise<void> = Promise.resolve()
    await act(async () => {
      saving = form?.handleSave() ?? Promise.resolve()
      await Promise.resolve()
    })
    ;(editor.state as unknown as { doc: FakeDoc }).doc = fakeDoc('事件 B')
    await act(async () => {
      form?.handleDocChange()
    })
    await act(async () => {
      release()
      await saving
    })

    expect(onSave.mock.calls[0]?.[1]?.document).toEqual(fakeDoc('事件 A').toJSON())
    expect(form?.docDirty).toBe(true)
  })
})

describe('离场屏障会带上所有常驻编辑器（F03 草稿侧）', () => {
  test('两个脏编辑器都被 flush；一个失败不阻断另一个，但整体必须 reject', async () => {
    let countryForm!: ReturnType<typeof useCountryForm>
    let characterForm!: ReturnType<typeof useCharacterForm>
    const countrySave = vi.fn(async (_id: number, _data: Partial<CountryFormData>) => {
      throw new Error('国家保存失败')
    })
    const characterSave = vi.fn(async (_id: number, _data: Partial<CharacterFormData>) => {})

    function Probe() {
      countryForm = useCountryForm(countryFixture(), countrySave)
      characterForm = useCharacterForm(characterFixture(), characterSave)
      return null
    }

    await mount(React.createElement(Probe))
    await act(async () => {
      countryForm?.addRelation('character', 7)
      characterForm?.setName('改过的角色')
    })

    let error: unknown
    await act(async () => {
      error = await flushPendingSaves().catch((reason: unknown) => reason)
    })

    expect(countrySave).toHaveBeenCalledTimes(1)
    expect(characterSave).toHaveBeenCalledTimes(1)
    expect(error).toBeInstanceOf(PendingSaveError)
    expect((error as PendingSaveError).message).toContain('国家保存失败')
  })

  test('保存屏障：先写完两个脏编辑器，再排干落盘队列', async () => {
    let countryForm!: ReturnType<typeof useCountryForm>
    let characterForm!: ReturnType<typeof useCharacterForm>
    const order: string[] = []
    const countrySave = vi.fn(async (_id: number, _data: Partial<CountryFormData>) => {
      order.push('country')
    })
    const characterSave = vi.fn(async (_id: number, _data: Partial<CharacterFormData>) => {
      order.push('character')
    })
    vault.drain.mockImplementation(async () => {
      order.push('drain')
      return {
        written: 0,
        movedToTrash: 0,
        restored: 0,
        removed: 0,
        conflicts: [],
        errors: [],
      }
    })

    function Probe() {
      countryForm = useCountryForm(countryFixture(), countrySave)
      characterForm = useCharacterForm(characterFixture(), characterSave)
      return null
    }

    await mount(React.createElement(Probe))
    await act(async () => {
      countryForm.addRelation('character', 7)
      characterForm.setName('改过的角色')
    })

    let failures: unknown[] = []
    await act(async () => {
      failures = await runSaveBarrier()
    })

    expect(failures).toEqual([])
    expect(order.slice(0, 2).sort()).toEqual(['character', 'country'])
    expect(order.at(-1)).toBe('drain')
  })

  test('两个脏编辑器都成功时 flush 正常 resolve', async () => {
    let countryForm!: ReturnType<typeof useCountryForm>
    let characterForm!: ReturnType<typeof useCharacterForm>
    const countrySave = vi.fn(async (_id: number, _data: Partial<CountryFormData>) => {})
    const characterSave = vi.fn(async (_id: number, _data: Partial<CharacterFormData>) => {})

    function Probe() {
      countryForm = useCountryForm(countryFixture(), countrySave)
      characterForm = useCharacterForm(characterFixture(), characterSave)
      return null
    }

    await mount(React.createElement(Probe))
    await act(async () => {
      countryForm?.addRelation('character', 7)
      characterForm?.setName('改过的角色')
    })

    await act(async () => {
      await flushPendingSaves()
    })

    expect(countrySave).toHaveBeenCalledTimes(1)
    expect(characterSave).toHaveBeenCalledTimes(1)
  })
})
