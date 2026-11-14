import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 备份载荷正式回归：
 * 1. `.ocbak` 里真的有灵感正文与分类空文件夹，并附持久 store 清单（含排除项）；
 * 2. 导出快照**晚于** `flushPendingSaves()`；flush 失败就中止，不读库、不落文件；
 * 3. 缺图 / 会话内素材的清单原样保留 —— 成功与否不能盖住遗漏。
 */

const h = vi.hoisted(() => {
  const rows: Record<string, Array<Record<string, unknown>>> = {
    characters: [],
    events: [],
    countries: [],
    worldEntries: [],
    tags: [],
    periods: [],
    meta: [],
  }
  const reads: string[] = []
  const table = (name: string) => ({
    filter: (predicate: (row: Record<string, unknown>) => boolean) => ({
      toArray: async () => {
        reads.push(name)
        return structuredClone(rows[name].filter(predicate))
      },
    }),
    toArray: async () => {
      reads.push(name)
      return structuredClone(rows[name])
    },
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
  return {
    rows,
    reads,
    db,
    flush: vi.fn(async () => {
      reads.push('flush')
    }),
    download: vi.fn(async () => 'oc-full-backup-test.ocbak'),
  }
})

vi.mock('@/lib/db', () => ({ db: h.db }))
vi.mock('@/lib/vault/vault-fs', () => ({ isVaultSupported: () => false, vaultFs: {} }))
vi.mock('@/lib/vault/vault-session', () => ({ getVaultSession: () => null }))
vi.mock('@/lib/vault/journal', () => ({
  readJournalLines: async () => [],
  JOURNAL_REL_PATH: '.ocstudio/journal.jsonl',
  mergeJournalLines: (_existing: string[], incoming: string[]) => incoming,
}))
vi.mock('@/lib/env', () => ({ isTauri: () => false }))
vi.mock('@/lib/image-service', () => ({
  // 所有图片都读不到字节：用来验证「缺图清单」没有被静默吞掉
  resolveImageUrl: () => '/images/defaults/avatar.png',
}))
vi.mock('@/lib/pending-saves', () => ({ flushPendingSaves: h.flush }))
vi.mock('@/lib/export/download', () => ({ downloadJson: h.download }))

import { BUILTIN_TEMPLATES } from '@/lib/templates/defaults'
import { loadTemplates, saveTemplates } from '@/lib/templates/store'
import { BUILTIN_INFO_GROUPS, loadInfoGroups, saveInfoGroups } from '@/lib/templates/info-groups'
import { BUILTIN_BODY_GROUPS, loadBodyGroups, saveBodyGroups } from '@/lib/templates/body-groups'
import { BUILTIN_CATEGORIES } from '@/lib/categories/builtins'
import { getCategories, loadCategories, saveCategories } from '@/lib/categories/store'
import { defaultFieldConfig } from '@/lib/fields/defaults'
import { loadFieldConfig, saveFieldConfig } from '@/lib/fields/store'
import { loadFolderRegistry, saveFolderRegistry } from '@/features/characters/folders'
import {
  createWorldFolder,
  getWorldFolderRegistry,
  loadWorldFolderRegistry,
  saveWorldFolderRegistry,
} from '@/features/categories/folders'
import {
  createInspiration,
  getInspirations,
  resetInspirations,
  updateInspiration,
} from '@/features/inspirations/store'
import { restoreBackupConfig } from '@/lib/export/backup-config'
import { exportFullBackupDetailed } from '@/lib/export/payload'
import { validateImportData } from '@/lib/import'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

async function resetToFactory(): Promise<void> {
  localStorage.clear()
  resetInspirations()
  await loadTemplates(true)
  await loadInfoGroups(true)
  await loadBodyGroups(true)
  await loadCategories(true)
  await loadFieldConfig()
  await loadFolderRegistry(true)
  await loadWorldFolderRegistry(true)
  await saveTemplates(clone(BUILTIN_TEMPLATES))
  await saveInfoGroups(clone(BUILTIN_INFO_GROUPS))
  await saveBodyGroups(clone(BUILTIN_BODY_GROUPS))
  await saveCategories(clone(BUILTIN_CATEGORIES))
  await saveFieldConfig(defaultFieldConfig())
  await saveFolderRegistry([])
  await saveWorldFolderRegistry({})
}

function clearRows(): void {
  for (const list of Object.values(h.rows)) list.length = 0
}

beforeEach(async () => {
  clearRows()
  h.reads.length = 0
  vi.clearAllMocks()
  h.flush.mockImplementation(async () => {
    h.reads.push('flush')
  })
  h.download.mockResolvedValue('oc-full-backup-test.ocbak')
  await resetToFactory()
})

describe('备份载荷 · 覆盖范围与清单', () => {
  it('灵感正文与分类空文件夹进备份，清单同时列出包含与排除', async () => {
    await createWorldFolder('宠物', '空夹甲')
    const draft = await createInspiration()
    await updateInspiration(draft.id, { title: '雨夜', content: '<p>塔顶的信号灯</p>' })

    const { payload, missingImages, skippedImages, configWarnings } = await exportFullBackupDetailed()

    expect(payload.version).toBe(1)
    expect(payload.config?.inspirations?.find((item) => item.title === '雨夜')?.content).toBe(
      '<p>塔顶的信号灯</p>',
    )
    expect(payload.config?.worldFolders).toEqual({ 宠物: ['空夹甲'] })
    expect(missingImages).toEqual([])
    expect(skippedImages).toEqual([])
    expect(configWarnings).toEqual([])

    expect(payload.manifest?.version).toBe(1)
    const included = payload.manifest?.included.map((store) => store.id) ?? []
    expect(included).toEqual(
      expect.arrayContaining([
        'entities',
        'images',
        'tagMeta',
        'journal',
        'inspirations',
        'worldFolders',
      ]),
    )
    const assistant = payload.manifest?.excluded.find((store) => store.id === 'assistantStorage')
    expect(assistant?.reason).toContain('密钥')
    expect(payload.manifest?.excluded.some((store) => store.id === 'trash')).toBe(true)

    // 备份最终要写成 JSON：清单 / 灵感 / 配置都必须能序列化并读回来
    const text = JSON.stringify(payload)
    const roundTrip = JSON.parse(text) as typeof payload
    expect(roundTrip.config?.worldFolders).toEqual({ 宠物: ['空夹甲'] })
    expect(roundTrip.manifest?.included.length).toBe(payload.manifest?.included.length)
  })

  it('导出 → 全新环境恢复：灵感与空文件夹都回来', async () => {
    await saveCategories(
      // 从当前表里开内置分类，模拟用户按需启用
      getCategories().map((category) =>
        category.id === 'cat-pet' ? { ...category, enabled: true } : category,
      ),
    )
    await createWorldFolder('宠物', '空夹甲')
    const draft = await createInspiration()
    await updateInspiration(draft.id, { title: '草稿', content: '<p>一句没写完的话</p>' })

    const { payload } = await exportFullBackupDetailed()

    await resetToFactory()
    const report = await restoreBackupConfig(payload.config)

    expect(report.restored).toEqual(expect.arrayContaining(['分类', '分类空文件夹清单']))
    expect(getWorldFolderRegistry()).toEqual({ 宠物: ['空夹甲'] })
    expect(getInspirations()).toHaveLength(1)
    expect(getInspirations()[0].content).toBe('<p>一句没写完的话</p>')

    // 新备份必须还能被主导入流程预检接受（清单 / 新键都不能让它判成坏文件）
    const summary = validateImportData(payload)
    expect(summary.characters).toBe(0)
    expect(summary.config).toEqual(expect.arrayContaining(['分类', '模板']))
  })
})

describe('备份载荷 · 草稿屏障', () => {
  it('先 flush 再读库：快照不会早于草稿保存', async () => {
    h.reads.length = 0
    await exportFullBackupDetailed()
    expect(h.reads[0]).toBe('flush')
    expect(h.reads).toEqual(expect.arrayContaining(['characters', 'worldEntries', 'meta']))
  })

  it('flush 失败就中止：不读库、不写文件、不返回载荷', async () => {
    h.reads.length = 0
    h.flush.mockRejectedValueOnce(new Error('保存失败：词条正文'))

    const attempt = exportFullBackupDetailed()
    await expect(attempt).rejects.toThrow(/已中止备份/)
    await expect(attempt).rejects.toThrow(/保存失败：词条正文/)
    expect(h.reads).toEqual([])
    expect(h.download).not.toHaveBeenCalled()
  })
})

describe('备份载荷 · 缺图报告', () => {
  it('读不到字节的图保留原路径并逐条报告', async () => {
    h.rows.characters.push({ id: 1, name: '甲', avatarUrl: 'images/hero.png', deleted: false })

    const detail = await exportFullBackupDetailed()

    expect(detail.missingImages).toEqual(['images/hero.png'])
    expect(detail.skippedImages).toEqual([])
    expect((detail.payload.data.characters[0] as { avatarUrl?: string }).avatarUrl).toBe('images/hero.png')
  })

  it('灵感草稿正文里的图也进备份的图片清单', async () => {
    const draft = await createInspiration()
    await updateInspiration(draft.id, {
      title: '带图的草稿',
      content: JSON.stringify({
        type: 'doc',
        content: [{ type: 'imageBlock', attrs: { src: 'images/draft.png' } }],
      }),
    })

    const detail = await exportFullBackupDetailed()

    expect(detail.missingImages).toEqual(['images/draft.png'])
    expect(detail.payload.config?.inspirations?.[0]?.content).toContain('images/draft.png')
  })

  it('会话内 blob: 地址单独记进 skipped，不混进缺图清单', async () => {    h.rows.characters.push({
      id: 1,
      name: '乙',
      avatarUrl: 'blob:http://localhost/only-this-session',
      deleted: false,
    })

    const detail = await exportFullBackupDetailed()

    expect(detail.missingImages).toEqual([])
    expect(detail.skippedImages).toEqual(['blob:http://localhost/only-this-session'])
    expect((detail.payload.data.characters[0] as { avatarUrl?: string }).avatarUrl).toBe(
      'blob:http://localhost/only-this-session',
    )
  })

  it('软删除的行不进备份', async () => {
    h.rows.characters.push({ id: 1, name: '活着的', deleted: false })
    h.rows.characters.push({ id: 2, name: '删掉的', deleted: true })

    const { payload } = await exportFullBackupDetailed()

    expect(payload.data.characters).toHaveLength(1)
    expect((payload.data.characters[0] as { name?: string }).name).toBe('活着的')
  })
})
