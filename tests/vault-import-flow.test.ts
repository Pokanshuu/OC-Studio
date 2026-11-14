import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

type Row = Record<string, unknown>
type Request = { type: string; values?: Row[] }
type Middleware = { create: (down: { table: (name: string) => { mutate: (req: Request) => Promise<{ results: number[] }> } }) => { table: (name: string) => { mutate: (req: Request) => Promise<{ results: number[] }> } } }
const h = vi.hoisted(() => {
  const names = ['characters', 'events', 'countries', 'worldEntries', 'tags', 'periods', 'meta', 'operationLog']
  const rows = Object.fromEntries(names.map((name) => [name, new Map<number, Row>()]))
  const state = { transaction: null as object | null, middleware: null as Middleware | null }
  const rawTable = (name: string) => ({
    mutate: async (req: Request) => {
      if (req.type === 'deleteRange') { rows[name].clear(); return { results: [] } }
      const results: number[] = []
      for (const row of req.values ?? []) {
        const id = typeof row.id === 'number' ? row.id : Math.max(0, ...rows[name].keys()) + 1
        rows[name].set(id, structuredClone({ ...row, id }))
        results.push(id)
      }
      return { results }
    },
  })
  const mutate = (name: string, req: Request) =>
    (state.middleware?.create({ table: rawTable }).table(name) ?? rawTable(name)).mutate(req)
  const table = (name: string) => ({
    toArray: async () => structuredClone([...rows[name].values()]),
    get: async (id: number) => structuredClone(rows[name].get(id)),
    put: async (row: Row) => (await mutate(name, { type: 'put', values: [row] })).results[0],
    update: async (id: number, patch: Row) => {
      const row = rows[name].get(id)
      if (!row) return 0
      await mutate(name, { type: 'put', values: [{ ...row, ...patch, id }] })
      return 1
    },
    clear: async () => { await mutate(name, { type: 'deleteRange' }) },
    bulkAdd: async (values: Row[]) => (await mutate(name, { type: 'add', values })).results.at(-1),
  })
  const db = {
    ...Object.fromEntries(names.map((name) => [name, table(name)])), table,
    use: (middleware: Middleware) => { state.middleware = middleware },
    transaction: async (...args: unknown[]) => {
      const previous = state.transaction
      state.transaction = {}
      try { return await (args.at(-1) as (tx: object) => Promise<unknown>)(state.transaction) }
      finally { state.transaction = previous }
    },
  }
  return {
    rows, state, db, selectedText: '', files: new Map<string, string>(), mtimes: new Map<string, number>(), bytes: new Map<string, number[]>(),
    fs: { scan: vi.fn(), exists: vi.fn(), readBytes: vi.fn(), writeTexts: vi.fn(), writeBytes: vi.fn(), importFile: vi.fn(), mkdir: vi.fn(), move: vi.fn(), remove: vi.fn() },
    vault: { status: 'ready', root: 'memory-import', rescan: vi.fn() },
  }
})
vi.mock('dexie', () => ({ default: { get currentTransaction() { return h.state.transaction } } }))
vi.mock('@/lib/db', () => ({ db: h.db }))
vi.mock('@/lib/vault/vault-fs', () => ({ vaultFs: h.fs, isVaultSupported: () => true }))
vi.mock('@/lib/vault/vault-provider', () => ({ useVault: () => h.vault }))
vi.mock('@/lib/vault/journal', () => ({ appendJournal: async () => {}, JOURNAL_REL_PATH: '.ocstudio/journal.jsonl', readJournalLines: async () => [], mergeJournalLines: () => [] }))
vi.mock('@/lib/export/backup-config', () => ({ restoreBackupConfig: async () => ({ restored: [], kept: [] }) }))
vi.mock('@/lib/export', () => ({ downloadFullBackup: vi.fn() }))
vi.mock('@/lib/data-events', () => ({ notifyDataUpdated: vi.fn() }))
vi.mock('@/lib/search', () => ({ resetSearchIndex: vi.fn() }))
vi.mock('@/lib/fields/store', () => ({
  FIELDS_REL_PATH: '.ocstudio/fields.json', getFieldConfig: () => ({}), serializeFieldConfig: () => '{}',
  loadFieldConfig: async () => {}, readFieldConfigFromRoot: async () => ({}), syncCustomFieldKeys: vi.fn(),
}))
vi.mock('@/lib/templates/info-groups', () => ({ INFO_GROUPS_REL_PATH: '.ocstudio/info-groups.json', loadInfoGroups: async () => {}, normalizeInfoGroups: () => [] }))
vi.mock('@tauri-apps/api/path', () => ({ appDataDir: async () => '/memory-appdata' }))
vi.mock('@tauri-apps/plugin-fs', () => ({ exists: async () => false }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))
vi.mock('@/components/ui/alert-dialog', () => {
  const wrap = ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children)
  return {
    AlertDialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? wrap({ children }) : null,
    AlertDialogContent: wrap, AlertDialogHeader: wrap, AlertDialogTitle: wrap, AlertDialogDescription: wrap, AlertDialogFooter: wrap, AlertDialogCancel: wrap,
  }
})
vi.mock('@/components/shared/merge-strategy', () => ({ MergeStrategyPicker: ({ onChange }: { onChange: (value: string) => void }) =>
  React.createElement('div', null, ...['skip', 'overwrite', 'keep-both'].map((value) => React.createElement('button', { key: value, onClick: () => onChange(value) }, value))),
}))

import { useImportExport } from '@/components/shared/ImportExportUI'
import { toast } from 'sonner'
import { currentStatus, drainVaultWrites, discardConflict, installVaultPersist, resetVaultWriteState } from '@/lib/vault/vault-persist'
import { createVaultSession, getVaultSession, setVaultSession } from '@/lib/vault/vault-session'
import { loadVault } from '@/lib/vault/vault-load'
import { runSaveBarrier } from '@/lib/save-barrier'
import { adoptDiskAndReload } from '@/lib/vault/vault-reload'
import { collectBodyImageRefs } from '@/lib/image-refs'
import { importData } from '@/lib/import'
import { importIntoOpenVault } from '@/lib/vault/import-live'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | null = null
let container: HTMLDivElement
const png = 'data:image/png;base64,aGVsbG8='
const body = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const backup = (patch: Record<string, Row[]> = {}) => ({ version: 1, data: Object.fromEntries(
  Object.entries({ characters: [], countries: [], events: [], worldEntries: [], tags: [], ...patch }).map(([name, rows]) => [name, rows.map((row: Row) => ({
    aliases: [], tags: [], gallery: [], avatars: [], relatedCharacters: [], relatedNotes: [], images: [], countries: [], characters: [], relations: [], references: [], custom: {}, content: '', category: '', parentId: null, order: 0, ...row,
  }))]),
) })

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('FileReader', class {
    result: string | null = null
    onload: (() => void) | null = null
    readAsText() { this.result = h.selectedText; this.onload?.() }
  })
  vi.clearAllMocks()
  for (const table of Object.values(h.rows)) table.clear()
  h.files.clear(); h.mtimes.clear(); h.bytes.clear()
  resetVaultWriteState()
  setVaultSession(createVaultSession(h.vault.root))
  installVaultPersist()
  h.fs.mkdir.mockResolvedValue(undefined)
  h.fs.exists.mockImplementation(async (_root: string, path: string) => h.files.has(path) || h.bytes.has(path))
  h.fs.readBytes.mockImplementation(async (_root: string, path: string) => h.bytes.get(path) ?? [...new TextEncoder().encode(h.files.get(path) ?? '')])
  h.fs.scan.mockImplementation(async () => ({
    root: h.vault.root,
    files: [...h.files].filter(([path]) => path.endsWith('.md')).map(([relPath, content]) => ({ relPath, content, size: content.length, mtimeMs: h.mtimes.get(relPath) ?? 1 })),
    skippedDirs: [], marker: h.files.get('oc-studio.json') ?? null, otherFiles: [...h.bytes.keys()], dirs: [], warnings: [], truncated: false,
  }))
  h.fs.writeBytes.mockImplementation(async (_root: string, path: string, bytes: number[]) => { h.bytes.set(path, bytes); return 1 })
  h.fs.writeTexts.mockImplementation(async (_root: string, entries: Array<{ relPath: string; content: string; createOnly?: boolean; expectedMtimeMs?: number }>) =>
    entries.map((entry) => {
      const exists = h.files.has(entry.relPath)
      if ((entry.createOnly && exists) || (entry.expectedMtimeMs !== undefined && entry.expectedMtimeMs !== h.mtimes.get(entry.relPath))) {
        return { relPath: entry.relPath, ok: false, conflict: true, mtimeMs: h.mtimes.get(entry.relPath) ?? 1, error: '目标已存在或已变化' }
      }
      h.files.set(entry.relPath, entry.content)
      const mtimeMs = (h.mtimes.get(entry.relPath) ?? 1) + 1
      h.mtimes.set(entry.relPath, mtimeMs)
      return { relPath: entry.relPath, ok: true, conflict: false, mtimeMs, error: null }
    }))
  h.vault.rescan.mockImplementation(async () => {
    const failures = await runSaveBarrier()
    if (failures.length > 0) return { status: 'blocked', failures }
    await loadVault(h.vault.root)
    return { status: 'reloaded' }
  })
})
afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  root = null
  resetVaultWriteState(); setVaultSession(null)
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals()
})

async function runImport(data: unknown, strategy = 'overwrite') {
  h.selectedText = JSON.stringify(data)
  function Probe() { return useImportExport().dialog }
  container = document.createElement('div'); document.body.append(container)
  root = createRoot(container)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  await act(async () => root?.render(React.createElement(QueryClientProvider, { client }, React.createElement(Probe))))
  const input = container.querySelector('input[type=file]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [new File([JSON.stringify(data)], 'test.ocbak')], configurable: true })
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(5)
  })
  const click = (label: string) => {
    const button = [...container.querySelectorAll('button')].find((item) => item.textContent === label)
    if (!button) throw new Error('缺少按钮 ' + label)
    button.click()
  }
  await act(async () => { click(strategy) })
  await act(async () => { click('确认导入'); await vi.advanceTimersByTimeAsync(100) })
}

function assertImported() {
  expect(vi.mocked(toast.error).mock.calls).toEqual([])
  expect(h.vault.rescan).toHaveBeenCalledOnce()
  expect(currentStatus()).toMatchObject({ pending: 0, lastError: null })
  expect(vi.mocked(toast.success).mock.calls.some(([text]) => String(text).startsWith('导入完成'))).toBe(true)
}

describe('open vault import through the actual UI hook and persistence middleware', () => {
  test('47 rows import, save and fresh scan without conflicts against the importer itself', async () => {
    await runImport(backup({
      characters: Array.from({ length: 15 }, (_, i) => ({ id: i + 1, name: '角色' + i, countryId: 1, document: body('角色正文' + i) })),
      countries: Array.from({ length: 7 }, (_, i) => ({ id: i + 1, name: '国家' + i })),
      events: Array.from({ length: 13 }, (_, i) => ({ id: i + 1, title: '事件' + i, characters: [1], countries: [1] })),
      worldEntries: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, title: '词条' + i, document: body('词条正文' + i) })),
    }))
    assertImported()
    expect([...h.files.keys()].filter((path) => path.endsWith('.md'))).toHaveLength(47)
    expect(getVaultSession()?.entries.size).toBe(47)
    const country = [...h.rows.countries.values()].find((row) => row.name === '国家0')
    const character = [...h.rows.characters.values()].find((row) => row.name === '角色0')
    const event = [...h.rows.events.values()].find((row) => row.title === '事件0')
    expect(character?.countryId).toBe(country?.id)
    expect(event?.countries).toEqual([country?.id])
    expect(event?.characters).toEqual([character?.id])
  })

  test('keep-both preserves existing bytes and adds exactly one copy of the incoming row', async () => {
    const original = '---\ntitle: 同名\n自定义: 原样保留\n---\n\n原来的正文\n'
    h.files.set('世界观/同名.md', original); h.mtimes.set('世界观/同名.md', 1)
    await loadVault(h.vault.root)
    await runImport(backup({ worldEntries: [{ id: 9, title: '同名', document: body('导入正文') }] }), 'keep-both')
    assertImported()
    expect(h.files.get('世界观/同名.md')).toBe(original)
    expect([...h.files.keys()].filter((path) => path.endsWith('.md'))).toHaveLength(2)
    expect(h.files.get('世界观/同名 (2).md')).toContain('导入正文')
  })

  test('overwrite updates the loaded file once and does not create its own mtime conflict', async () => {
    h.files.set('世界观/同名.md', '---\ntitle: 同名\n---\n\n旧正文')
    h.mtimes.set('世界观/同名.md', 1)
    await loadVault(h.vault.root)
    await runImport(backup({ worldEntries: [{ id: 9, title: '同名', document: body('更新正文') }] }))
    assertImported()
    expect(h.files.get('世界观/同名.md')).toContain('更新正文')
    expect([...h.files.keys()].filter((path) => path.endsWith('.md'))).toHaveLength(1)
  })

  test('field and body pictures land as bytes and remain readable after a fresh scan', async () => {
    const document = { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: '带图正文' }] },
      { type: 'imageBlock', attrs: { src: png, width: null } },
    ] }
    await runImport(backup({ worldEntries: [{ title: '没有备份ID也能带图', cover: png, document }], tags: [{ id: 1, name: '有标签' }], periods: [{ id: 1, name: '有时期', startTime: '1000' }] }))
    assertImported()
    expect(h.bytes.size).toBe(1)
    const path = [...h.bytes.keys()][0]
    expect(h.bytes.get(path)).toEqual([...new TextEncoder().encode('hello')])
    const restored = [...h.rows.worldEntries.values()][0]
    expect(restored.cover).toBe(path)
    expect(collectBodyImageRefs(restored.document)).toEqual([path])
    expect(h.files.get('世界观/没有备份ID也能带图.md')).not.toContain('data:image')
  })

  test('skip leaves existing bytes and media alone', async () => {
    const original = '---\ntitle: 原有\n---\n\n不能改写'
    h.files.set('世界观/原有.md', original); h.mtimes.set('世界观/原有.md', 1)
    await loadVault(h.vault.root)
    await runImport(backup({ worldEntries: [{ id: 9, title: '原有', cover: png, document: body('不应导入') }] }), 'skip')
    assertImported()
    expect(h.files.get('世界观/原有.md')).toBe(original)
    expect(h.fs.writeBytes).not.toHaveBeenCalled()
    expect(h.fs.writeTexts).not.toHaveBeenCalled()
  })

  test('a genuine external conflict stays blocked; confirmed adoption reloads disk without overwriting it', async () => {
    const original = '---\ntitle: 同名\n---\n\n旧正文'
    const external = '---\ntitle: 同名\n---\n\n外部版本必须保留'
    h.files.set('世界观/同名.md', original); h.mtimes.set('世界观/同名.md', 1)
    await loadVault(h.vault.root)
    h.files.set('世界观/同名.md', external); h.mtimes.set('世界观/同名.md', 9)
    await runImport(backup({ worldEntries: [{ id: 1, title: '同名', document: body('本地导入版') }] }))
    expect(currentStatus().pending).toBe(1)
    expect(h.files.get('世界观/同名.md')).toBe(external)
    expect(vi.mocked(toast.success).mock.calls).toEqual([])
    const conflicts = (await drainVaultWrites()).conflicts
    expect(conflicts).toEqual(['世界观/同名.md'])
    h.fs.writeTexts.mockClear()
    const adopted = await adoptDiskAndReload(conflicts, {
      discard: discardConflict, drain: drainVaultWrites, status: currentStatus,
      reload: async () => { await loadVault(h.vault.root) },
    })
    expect(adopted.status).toBe('reloaded')
    expect(currentStatus()).toMatchObject({ pending: 0, lastError: null })
    expect(h.files.get('世界观/同名.md')).toBe(external)
    expect(h.fs.writeTexts).not.toHaveBeenCalled()
    expect(JSON.stringify([...h.rows.worldEntries.values()][0].document)).toContain('外部版本必须保留')
  })

  test('failed writes retain imported rows; retry then refresh succeeds', async () => {
    h.fs.writeTexts.mockResolvedValueOnce([{ relPath: '世界观/重试.md', ok: false, conflict: false, mtimeMs: null, error: '模拟磁盘满' }])
    await runImport(backup({ worldEntries: [{ id: 1, title: '重试', document: body('应保留正文') }] }))
    expect(currentStatus().pending).toBe(1)
    expect(h.rows.worldEntries.size).toBe(1)
    expect(vi.mocked(toast.success).mock.calls).toEqual([])
    await expect(h.vault.rescan()).resolves.toEqual({ status: 'reloaded' })
    expect(currentStatus().pending).toBe(0)
    expect(h.files.get('世界观/重试.md')).toContain('应保留正文')
  })

  test('a manual edit during image IO survives the later media patch', async () => {
    const writeBytes = h.fs.writeBytes.getMockImplementation()
    h.fs.writeBytes.mockImplementation(async (...args: unknown[]) => {
      await h.db.table('worldEntries').update(1, { summary: '人工在图片写入期间修改', document: body('人工新正文') })
      return writeBytes?.(...args)
    })
    const result = await importIntoOpenVault(h.vault.root, backup({ worldEntries: [{ id: 3, title: '并发编辑', cover: png, document: body('导入旧正文') }] }), 'overwrite')
    expect(result.images).toBe(1)
    const row = h.rows.worldEntries.get(1)
    expect(row?.summary).toBe('人工在图片写入期间修改')
    expect(row?.document).toEqual(body('人工新正文'))
    expect(row?.cover).toBe([...h.bytes.keys()][0])
  })

  test('an automatic queue flush during slow image IO does not conflict with the later media update', async () => {
    const writeBytes = h.fs.writeBytes.getMockImplementation()
    h.fs.writeBytes.mockImplementation(async (...args: unknown[]) => {
      const first = await drainVaultWrites()
      expect(first.conflicts).toEqual([])
      expect(first.written).toBe(1)
      return writeBytes?.(...args)
    })
    await runImport(backup({ worldEntries: [{ id: 1, title: '慢图片', cover: png, document: body('正文保持') }] }))
    assertImported()
    expect(h.files.get('世界观/慢图片.md')).not.toContain('data:image')
    expect([...h.files.keys()].filter((path) => path.endsWith('.md'))).toHaveLength(1)
  })

  test('afterCommit reports inserted and overwritten rows, including rows without backup IDs, but excludes skips', async () => {
    h.rows.worldEntries.set(10, { id: 10, title: '已有', category: '', parentId: null })
    const afterCommit = vi.fn(async () => {})
    await importData(backup({ worldEntries: [{ title: '新条目' }, { title: '已有' }] }), 'overwrite', undefined, { afterCommit })
    expect(afterCommit).toHaveBeenCalledWith([{ table: 'worldEntries', id: 10 }, { table: 'worldEntries', id: 11 }])
    afterCommit.mockClear()
    await importData(backup({ worldEntries: [{ id: 99, title: '已有' }] }), 'skip', undefined, { afterCommit })
    expect(afterCommit).toHaveBeenCalledWith([])
  })

  test('47 conflicts for newly reserved paths can all adopt disk in the same running session', async () => {
    h.fs.writeTexts.mockImplementationOnce(async (_root: string, entries: Array<{ relPath: string }>) => entries.map((entry) => {
      h.files.set(entry.relPath, '---\ntitle: 外部保留\n---\n\n真实磁盘正文')
      h.mtimes.set(entry.relPath, 20)
      return { relPath: entry.relPath, ok: false, conflict: true, mtimeMs: 20, error: '外部刚创建' }
    }))
    await runImport(backup({ worldEntries: Array.from({ length: 47 }, (_, i) => ({ id: i + 1, title: '冲突' + i, document: body('本地版') })) }))
    expect(currentStatus().pending).toBe(47)
    const report = await drainVaultWrites()
    expect(report.conflicts).toHaveLength(47)
    const diskBefore = [...h.files]
    h.fs.writeTexts.mockClear()
    const result = await adoptDiskAndReload(report.conflicts, {
      discard: discardConflict, drain: drainVaultWrites, status: currentStatus,
      reload: async () => { await loadVault(h.vault.root) },
    })
    expect(result.status).toBe('reloaded')
    expect(currentStatus()).toMatchObject({ pending: 0, lastError: null })
    expect([...h.files]).toEqual(diskBefore)
    expect(h.fs.writeTexts).not.toHaveBeenCalled()
    expect(getVaultSession()?.entries.size).toBe(47)
  })

  test('same-name target links still point to the imported copy after queue flush and full scan', async () => {
    h.files.set('角色/同名角色.md', '---\nname: 同名角色\n---\n\n原有角色')
    h.mtimes.set('角色/同名角色.md', 1)
    await loadVault(h.vault.root)
    await runImport(backup({
      characters: [{ id: 3, name: '同名角色' }],
      worldEntries: [{ id: 5, title: '引用导入角色', document: { type: 'doc', content: [{ type: 'paragraph', content: [
        { type: 'mention', attrs: { id: '3', label: '新来的', entityType: 'character', raw: '同名角色#小节|新来的' } },
      ] }] } }],
    }), 'keep-both')
    assertImported()
    const target = [...getVaultSession()!.entries.values()].find((row) => row.relPath === '角色/同名角色 (2).md')
    const note = [...h.rows.worldEntries.values()][0]
    const attrs = (note.document as { content: Array<{ content: Array<{ attrs: Row }> }> }).content[0].content[0].attrs
    expect(attrs.id).toBe(String(target?.id))
    expect(attrs.raw).toBe('同名角色 (2)#小节|新来的')
    expect(attrs.label).toBe('新来的')
  })
})
