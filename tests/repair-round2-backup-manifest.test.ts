import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 第二轮 Q05 后续：`.ocbak` 的 manifest 不能虚称完整。
 *
 * 配置段读不到 / 缺图 / 会话内素材没打包时：
 * - 文件里的 `manifest.complete === false`，`manifest.unavailable` 逐项写明；
 * - 读不到的配置段不写进 `config`（避免把空表 / 旧缓存当真实设置）；
 * - 导出结果与备份界面拿到的 `complete` 同步为 false。
 */

const h = vi.hoisted(() => {
  const files = new Map<string, string | Error>()
  const fs = {
    exists: vi.fn(),
    readBytes: vi.fn(),
    listAssets: vi.fn(),
    mkdir: vi.fn(),
    writeTexts: vi.fn(),
    remove: vi.fn(),
  }
  const rows: Record<string, Array<Record<string, unknown>>> = {
    characters: [],
    events: [],
    countries: [],
    worldEntries: [],
    tags: [],
    periods: [],
    meta: [],
  }
  const table = (name: string) => ({
    filter: (predicate: (row: Record<string, unknown>) => boolean) => ({
      toArray: async () => structuredClone(rows[name].filter(predicate)),
    }),
    toArray: async () => structuredClone(rows[name]),
    count: async () => rows[name].length,
    get: async (id: number) => structuredClone(rows[name].find((row) => row.id === id)),
    put: async (row: Record<string, unknown>) => {
      rows[name] = rows[name].filter((item) => item.id !== row.id)
      rows[name].push(structuredClone(row))
      return row.id
    },
    update: async (id: number, patch: Record<string, unknown>) => {
      const index = rows[name].findIndex((row) => row.id === id)
      if (index >= 0) rows[name][index] = { ...rows[name][index], ...patch }
      return 1
    },
  })
  const db = {
    characters: table('characters'),
    events: table('events'),
    countries: table('countries'),
    worldEntries: table('worldEntries'),
    tags: table('tags'),
    periods: table('periods'),
    meta: table('meta'),
  }
  return { files, fs, rows, db, download: vi.fn(async () => 'oc-round2.ocbak') }
})

vi.mock('@/lib/vault/vault-fs', () => ({ isVaultSupported: () => true, vaultFs: h.fs }))
vi.mock('@/lib/db', () => ({ db: h.db }))
vi.mock('@/lib/vault/journal', () => ({
  readJournalLines: async () => [],
  JOURNAL_REL_PATH: '.ocstudio/journal.jsonl',
  mergeJournalLines: (_existing: string[], incoming: string[]) => incoming,
}))
vi.mock('@/lib/env', () => ({ isTauri: () => false }))
vi.mock('@/lib/image-service', () => ({
  resolveImageUrl: () => '/images/defaults/avatar.png',
}))
vi.mock('@/lib/export/download', () => ({ downloadJson: h.download }))

import { createVaultSession, setVaultSession } from '@/lib/vault/vault-session'
import { resetInspirations } from '@/features/inspirations/store'
import { downloadFullBackup, exportFullBackupDetailed } from '@/lib/export/payload'
import {
  BACKUP_MANIFEST_VERSION,
  buildBackupManifest,
} from '@/lib/export/backup-manifest'

const INSPIRATIONS = '.ocstudio/inspirations.json'
const CATEGORIES = '.ocstudio/categories.json'
const TEMPLATES_DIR = '.ocstudio/templates'

function encode(text: string): number[] {
  return Array.from(new TextEncoder().encode(text))
}

function useRoot(name: string): void {
  setVaultSession(createVaultSession(`round2-manifest-${name}`))
}

beforeEach(() => {
  localStorage.clear()
  h.files.clear()
  for (const list of Object.values(h.rows)) list.length = 0
  resetInspirations()
  vi.clearAllMocks()
  h.fs.exists.mockImplementation(async (_root: string, path: string) => h.files.has(path))
  h.fs.readBytes.mockImplementation(async (_root: string, path: string) => {
    const value = h.files.get(path)
    if (value instanceof Error) throw value
    if (value === undefined) throw new Error(`missing file: ${path}`)
    return encode(value)
  })
  h.fs.listAssets.mockImplementation(async (_root: string, dir: string) => {
    return [...h.files.entries()]
      .filter(([path, value]) => path.startsWith(`${dir}/`) && !(value instanceof Error))
      .map(([path]) => ({ name: path.slice(dir.length + 1), relPath: path }))
  })
  h.fs.mkdir.mockResolvedValue(undefined)
  h.fs.remove.mockResolvedValue(undefined)
  h.fs.writeTexts.mockImplementation(
    async (_root: string, entries: Array<{ relPath: string; content: string }>) => {
      for (const entry of entries) h.files.set(entry.relPath, entry.content)
      return entries.map((entry) => ({ relPath: entry.relPath, ok: true, mtimeMs: 1 }))
    },
  )
  h.download.mockResolvedValue('oc-round2.ocbak')
})

afterEach(() => {
  setVaultSession(null)
})

describe('Q05 · manifest 完整性', () => {
  it('灵感 / 分类读不到：config 不含这些段，manifest 标 incomplete 并逐项列出', async () => {
    useRoot('bad')
    h.files.set(INSPIRATIONS, new Error('EACCES: permission denied'))
    h.files.set(CATEGORIES, '{ broken')

    const detail = await exportFullBackupDetailed()

    expect(detail.complete).toBe(false)
    expect(detail.payload.config?.inspirations).toBeUndefined()
    expect(detail.payload.config?.categories).toBeUndefined()
    expect(detail.configWarnings.some((warning) => warning.includes('灵感'))).toBe(true)
    expect(detail.configWarnings.some((warning) => warning.includes('分类'))).toBe(true)

    const manifest = detail.payload.manifest
    expect(manifest?.version).toBe(BACKUP_MANIFEST_VERSION)
    expect(manifest?.complete).toBe(false)
    expect(manifest?.unavailable).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'inspirations', label: '灵感' }),
        expect.objectContaining({ id: 'categories', label: '分类' }),
      ]),
    )
    // `included` 只列本次**实际**打包的 store：读不到的不能留在「已包含」里
    const includedIds = manifest?.included.map((store) => store.id) ?? []
    expect(includedIds).not.toContain('inspirations')
    expect(includedIds).not.toContain('categories')
    expect(includedIds).toEqual(expect.arrayContaining(['entities', 'images', 'templates']))

    // 落成 JSON 后仍然不能宣称完整（旧版应用可以忽略，但新版必须看懂）
    const parsed = JSON.parse(JSON.stringify(detail.payload)) as {
      manifest: { complete: boolean; unavailable: Array<{ id: string }> }
      config: Record<string, unknown>
    }
    expect(parsed.manifest.complete).toBe(false)
    expect(parsed.manifest.unavailable.map((issue) => issue.id)).toEqual(
      expect.arrayContaining(['inspirations', 'categories']),
    )
    expect(parsed.config).not.toHaveProperty('inspirations')
    expect(parsed.config).not.toHaveProperty('categories')
  })

  it('部分模板文件解析失败：模板整段不进备份，清单点名', async () => {
    useRoot('template-bad')
    h.files.set(`${TEMPLATES_DIR}/broken.md`, '不是模板')

    const detail = await exportFullBackupDetailed()

    expect(detail.payload.config?.templates).toBeUndefined()
    expect(detail.payload.manifest?.complete).toBe(false)
    expect(detail.payload.manifest?.unavailable).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'templates', label: '模板' })]),
    )
  })

  it('缺图也进清单：素材没打包时 complete 仍为 false', async () => {
    useRoot('image-missing')
    h.rows.characters.push({ id: 1, name: '甲', avatarUrl: 'images/hero.png', deleted: false })

    const detail = await exportFullBackupDetailed()

    expect(detail.missingImages).toContain('images/hero.png')
    expect(detail.complete).toBe(false)
    expect(detail.payload.manifest?.complete).toBe(false)
    expect(detail.payload.manifest?.unavailable).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'images' })]),
    )
    expect(detail.payload.manifest?.included.map((store) => store.id)).not.toContain('images')
  })

  it('全部可读：清单完整，config 含灵感（对照组）', async () => {
    useRoot('good')
    h.files.set(
      INSPIRATIONS,
      JSON.stringify({
        version: 1,
        items: [{ id: 'ok', title: '正常草稿', content: '<p>正文</p>', createdAt: 1, updatedAt: 2 }],
      }),
    )

    const detail = await exportFullBackupDetailed()

    expect(detail.complete).toBe(true)
    expect(detail.configWarnings).toEqual([])
    expect(detail.payload.config?.inspirations?.map((item) => item.title)).toEqual(['正常草稿'])
    expect(detail.payload.manifest?.complete).toBe(true)
    expect(detail.payload.manifest?.unavailable).toEqual([])
  })

  it('downloadFullBackup 把 complete 一起交给界面（不完整不得报完整）', async () => {
    useRoot('download-bad')
    h.files.set(INSPIRATIONS, new Error('EACCES: permission denied'))

    const result = await downloadFullBackup()

    expect(result.complete).toBe(false)
    expect(result.configWarnings.some((warning) => warning.includes('灵感'))).toBe(true)
    expect(h.download).toHaveBeenCalledTimes(1)
  })

  it('清单生成器默认完整；传入缺失项后 complete=false', () => {
    const clean = buildBackupManifest()
    expect(clean.complete).toBe(true)
    expect(clean.unavailable).toEqual([])

    const broken = buildBackupManifest({
      unavailable: [{ id: 'inspirations', label: '灵感', reason: '权限拒绝' }],
    })
    expect(broken.complete).toBe(false)
    expect(broken.unavailable).toEqual([
      { id: 'inspirations', label: '灵感', reason: '权限拒绝' },
    ])
  })
})
