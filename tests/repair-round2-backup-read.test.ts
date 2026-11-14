import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 第二轮 Q05 正式回归：备份读取不能把「store 内部 catch 后的正常 resolve」
 * 当成「读到了」。
 *
 * 这里跑**真实 store**（分类 / 字段表 / 模板 / 信息组 / 正文组 / 两个文件夹清单 /
 * 灵感），只替换文件系统与 Dexie：权限拒绝、坏 JSON、坏模板文件、切库后的旧缓存、
 * 失败后重试都要在备份里被识别成「未包含」；普通页面加载仍然容错（不抛）。
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
  const meta = { row: undefined as Record<string, unknown> | undefined }
  const db = {
    meta: {
      get: async () => meta.row,
      put: async (row: Record<string, unknown>) => {
        meta.row = row
        return row.id
      },
      update: async (_id: number, patch: Record<string, unknown>) => {
        meta.row = { ...(meta.row ?? { id: 1 }), ...patch }
        return 1
      },
    },
  }
  return { files, fs, db, meta }
})

vi.mock('@/lib/vault/vault-fs', () => ({ isVaultSupported: () => true, vaultFs: h.fs }))
vi.mock('@/lib/db', () => ({ db: h.db }))

import { createVaultSession, setVaultSession } from '@/lib/vault/vault-session'
import {
  collectBackupConfig,
  loadBackupConfigSnapshot,
  restoreBackupConfig,
} from '@/lib/export/backup-config'
import { getCategories, loadCategories } from '@/lib/categories/store'
import type { Category } from '@/lib/categories/types'
import { getFieldConfig, loadFieldConfig } from '@/lib/fields/store'
import { BUILTIN_BODY_GROUPS, getBodyGroups, loadBodyGroups } from '@/lib/templates/body-groups'
import { BUILTIN_INFO_GROUPS, getInfoGroups } from '@/lib/templates/info-groups'
import { BUILTIN_TEMPLATES } from '@/lib/templates/defaults'
import { serializeTemplate } from '@/lib/templates/serialize'
import { getInspirations, loadInspirations, resetInspirations } from '@/features/inspirations/store'
import type { Inspiration } from '@/features/inspirations/types'
import type { BodyGroup } from '@/lib/templates/body-groups'

const INSPIRATIONS = '.ocstudio/inspirations.json'
const CATEGORIES = '.ocstudio/categories.json'
const FIELDS = '.ocstudio/fields.json'
const BODY_GROUPS = '.ocstudio/body-groups.json'
const INFO_GROUPS = '.ocstudio/info-groups.json'
const WORLD_FOLDERS = '.ocstudio/world-folders.json'
const TEMPLATES_DIR = '.ocstudio/templates'

function encode(text: string): number[] {
  return Array.from(new TextEncoder().encode(text))
}

function useRoot(name: string): void {
  setVaultSession(createVaultSession(`round2-${name}`))
}

function inspiration(over: Partial<Inspiration> & Pick<Inspiration, 'id'>): Inspiration {
  return {
    title: '',
    content: '<p></p>',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...over,
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

beforeEach(() => {
  localStorage.clear()
  h.files.clear()
  h.meta.row = undefined
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
})

afterEach(() => {
  setVaultSession(null)
})

describe('Q05 · 读不到的文件不能让备份收下空表或旧缓存', () => {
  it('灵感文件权限拒绝：warnings 点名灵感，备份里没有 inspirations，普通加载仍容错', async () => {
    useRoot('insp-permission')
    h.files.set(INSPIRATIONS, new Error('EACCES: permission denied'))

    const warnings: string[] = []
    const config = await collectBackupConfig(warnings)

    expect(warnings.some((warning) => warning.includes('灵感'))).toBe(true)
    expect(config.inspirations).toBeUndefined()

    // 普通页面路径：加载 resolve、不抛，界面能打开（快照保持空 / 旧值）
    await expect(loadInspirations()).resolves.toBeUndefined()
    expect(getInspirations()).toEqual([])
  })

  it('切库后新库灵感读失败：旧库缓存不能进备份', async () => {
    useRoot('old-vault')
    h.files.set(
      INSPIRATIONS,
      JSON.stringify({ version: 1, items: [inspiration({ id: 'old', title: '旧库的草稿' })] }),
    )
    await loadInspirations()
    expect(getInspirations().map((item) => item.title)).toEqual(['旧库的草稿'])

    // 换到另一个库：同一个相对路径在新库里读不出来
    useRoot('new-vault')
    h.files.set(INSPIRATIONS, new Error('EACCES: permission denied'))

    const warnings: string[] = []
    const config = await collectBackupConfig(warnings)

    expect(warnings.some((warning) => warning.includes('灵感'))).toBe(true)
    expect(config.inspirations).toBeUndefined()
    // 内存里仍是旧库缓存（UI 容错保留），但备份不能拿它冒充新库内容
    expect(getInspirations().map((item) => item.title)).toEqual(['旧库的草稿'])
  })

  it('灵感文件是坏 JSON：读取失败，不当成空表', async () => {
    useRoot('insp-bad-json')
    h.files.set(INSPIRATIONS, '{ not valid json')

    const warnings: string[] = []
    const config = await collectBackupConfig(warnings)

    expect(warnings.some((warning) => warning.includes('灵感'))).toBe(true)
    expect(config.inspirations).toBeUndefined()
    await expect(loadInspirations()).resolves.toBeUndefined()
    expect(getInspirations()).toEqual([])
  })

  it('失败后重试（同一库、权限恢复）：下一次备份能读到，warnings 清空', async () => {
    useRoot('insp-retry')
    h.files.set(INSPIRATIONS, new Error('EACCES: permission denied'))

    const firstWarnings: string[] = []
    const first = await collectBackupConfig(firstWarnings)
    expect(firstWarnings.some((warning) => warning.includes('灵感'))).toBe(true)
    expect(first.inspirations).toBeUndefined()

    // 故障解除：同一库根、同一个文件现在可读
    h.files.set(
      INSPIRATIONS,
      JSON.stringify({ version: 1, items: [inspiration({ id: 'retry', title: '重试成功' })] }),
    )

    const secondWarnings: string[] = []
    const second = await collectBackupConfig(secondWarnings)
    expect(secondWarnings).toEqual([])
    expect(second.inspirations?.map((item) => item.title)).toEqual(['重试成功'])
  })

  it('分类坏 JSON / 字段表坏 JSON：各自标成未包含，普通加载仍回落可打开', async () => {
    useRoot('cat-field-bad')
    h.files.set(CATEGORIES, '{ broken')
    h.files.set(FIELDS, '{ broken too')

    const warnings: string[] = []
    const config = await collectBackupConfig(warnings)

    expect(warnings.some((warning) => warning.includes('分类'))).toBe(true)
    expect(warnings.some((warning) => warning.includes('字段表'))).toBe(true)
    expect(config.categories).toBeUndefined()
    expect(config.fields).toBeUndefined()

    await expect(loadCategories()).resolves.toBeUndefined()
    await expect(loadFieldConfig()).resolves.toBeUndefined()
    expect(getCategories().some((category) => category.id === 'cat-pet')).toBe(true)
    expect(getFieldConfig().character.length).toBeGreaterThan(0)
  })

  it('基本信息组 / 正文组坏 JSON：都算未包含，且不影响另外一段', async () => {
    useRoot('groups-bad')
    h.files.set(INFO_GROUPS, '{ broken')
    h.files.set(BODY_GROUPS, '{ broken too')

    const warnings: string[] = []
    const config = await collectBackupConfig(warnings)

    expect(warnings.some((warning) => warning.includes('基本信息组'))).toBe(true)
    expect(warnings.some((warning) => warning.includes('正文组'))).toBe(true)
    expect(config.infoGroups).toBeUndefined()
    expect(config.bodyGroups).toBeUndefined()

    await expect(loadBodyGroups()).resolves.toBeUndefined()
    expect(getBodyGroups().length).toBe(BUILTIN_BODY_GROUPS.length)
    expect(getInfoGroups().length).toBe(BUILTIN_INFO_GROUPS.length)
  })

  it('模板目录里有解析不出来的文件：整段标成未包含（不能静默跳过）', async () => {
    useRoot('templates-bad')
    const valid = BUILTIN_TEMPLATES.find((doc) => doc.id === 'event')
    if (valid === undefined) throw new Error('缺少内置事件模板')
    h.files.set(`${TEMPLATES_DIR}/event.md`, serializeTemplate(valid))
    h.files.set(`${TEMPLATES_DIR}/broken.md`, '这不是一份模板（没有 frontmatter）')

    const warnings: string[] = []
    const config = await collectBackupConfig(warnings)

    expect(warnings.some((warning) => warning.includes('模板'))).toBe(true)
    expect(config.templates).toBeUndefined()
  })

  it('JSON 合法但结构不对（{} / null / []）：也算未包含', async () => {
    useRoot('shape-bad')
    h.files.set(CATEGORIES, '{}')
    h.files.set(BODY_GROUPS, 'null')
    h.files.set(FIELDS, '[]')
    h.files.set(WORLD_FOLDERS, '{"version":1}')

    const warnings: string[] = []
    const config = await collectBackupConfig(warnings)

    expect(warnings.some((warning) => warning.includes('分类'))).toBe(true)
    expect(warnings.some((warning) => warning.includes('正文组'))).toBe(true)
    expect(warnings.some((warning) => warning.includes('字段表'))).toBe(true)
    expect(warnings.some((warning) => warning.includes('分类空文件夹清单'))).toBe(true)
    expect(config.categories).toBeUndefined()
    expect(config.bodyGroups).toBeUndefined()
    expect(config.fields).toBeUndefined()
    expect(config.worldFolders).toBeUndefined()
  })

  it('模板 id 重复：只认第一份也要在备份里说清（不能静默丢）', async () => {
    useRoot('template-duplicate')
    const character = BUILTIN_TEMPLATES.find((doc) => doc.id === 'character')
    if (character === undefined) throw new Error('缺少内置角色模板')
    h.files.set(`${TEMPLATES_DIR}/character.md`, serializeTemplate(character))
    h.files.set(`${TEMPLATES_DIR}/character-copy.md`, serializeTemplate(character))

    const warnings: string[] = []
    const config = await collectBackupConfig(warnings)

    expect(warnings.some((warning) => warning.includes('模板'))).toBe(true)
    expect(config.templates).toBeUndefined()
  })

  it('分类空文件夹清单坏 JSON：标成未包含', async () => {
    useRoot('folders-bad')
    h.files.set(WORLD_FOLDERS, '{ broken')

    const warnings: string[] = []
    const config = await collectBackupConfig(warnings)

    expect(warnings.some((warning) => warning.includes('分类空文件夹清单'))).toBe(true)
    expect(config.worldFolders).toBeUndefined()
  })

  it('笔记库还没打开：所有配置段都不可核对，备份为空且逐段说明', async () => {
    setVaultSession(null)

    const warnings: string[] = []
    const config = await collectBackupConfig(warnings)

    expect(warnings.length).toBeGreaterThanOrEqual(8)
    expect(config).toEqual({})
  })

  it('全部可读时 snapshot 没有 unavailable（对照组）', async () => {
    useRoot('all-good')
    h.files.set(
      INSPIRATIONS,
      JSON.stringify({ version: 1, items: [inspiration({ id: 'ok', title: '正常' })] }),
    )

    const snapshot = await loadBackupConfigSnapshot()
    expect(snapshot.unavailable).toEqual([])
    expect(snapshot.config.inspirations?.map((item) => item.title)).toEqual(['正常'])
    expect(snapshot.config.categories?.some((category) => category.id === 'cat-pet')).toBe(true)
  })
})

describe('Q05 · 恢复侧不在未知目标状态下覆盖', () => {
  it('目标正文组读失败：备份里的正文组整段保留不落盘', async () => {
    useRoot('restore-body-unknown')
    h.files.set(BODY_GROUPS, '{ broken')

    const backupBody = clone(BUILTIN_BODY_GROUPS).map((group: BodyGroup) =>
      group.id === 'body-character' ? { ...group, markdown: '备份里的骨架' } : group,
    )
    const report = await restoreBackupConfig({ bodyGroups: backupBody })

    expect(report.restored).toEqual([])
    expect(report.kept).toContain('正文组')
    expect(report.kept.some((label) => label.includes('无法确认目标设置状态'))).toBe(true)
    expect(getBodyGroups().find((group) => group.id === 'body-character')?.markdown).not.toBe(
      '备份里的骨架',
    )
  })

  it('目标设置状态未知时，连其他可读段也不恢复（整段保留）', async () => {
    useRoot('restore-whole-unknown')
    h.files.set(BODY_GROUPS, '{ broken')

    // 分类本身可读，但整体状态未知 → 分类也不能恢复（整段保留规则）
    const backupCategories: Category[] = [
      {
        id: 'cat-pet',
        name: '宠物',
        template: 'pet',
        icon: 'pawPrint',
        order: 0,
        enabled: true,
        builtin: true,
      },
    ]
    const report = await restoreBackupConfig({ categories: backupCategories })

    expect(report.restored).toEqual([])
    expect(report.kept).toContain('分类')
    expect(getCategories().find((category) => category.id === 'cat-pet')?.enabled).toBe(false)
  })

  it('目标灵感读失败：跳过合并并报告，设置状态已知时可恢复设置', async () => {
    useRoot('restore-insp-unknown')
    h.files.set(INSPIRATIONS, new Error('EACCES: permission denied'))

    const backupCategories: Category[] = [
      {
        id: 'cat-pet',
        name: '宠物',
        template: 'pet',
        icon: 'pawPrint',
        order: 0,
        enabled: true,
        builtin: true,
      },
    ]
    const report = await restoreBackupConfig({
      categories: backupCategories,
      inspirations: [inspiration({ id: 'from-backup', title: '备份灵感' })],
    })

    expect(report.inspirations).toBeUndefined()
    expect(report.kept.some((label) => label.includes('灵感') && label.includes('目标状态未知'))).toBe(
      true,
    )
    expect(getInspirations()).toEqual([])
    // 设置状态可核对 → 分类照常恢复
    expect(getCategories().find((category) => category.id === 'cat-pet')?.enabled).toBe(true)
  })

  it('笔记库还没打开：恢复同样整段保留，不碰任何设置', async () => {
    setVaultSession(null)

    const backupCategories: Category[] = [
      {
        id: 'cat-pet',
        name: '宠物',
        template: 'pet',
        icon: 'pawPrint',
        order: 0,
        enabled: true,
        builtin: true,
      },
    ]
    const report = await restoreBackupConfig({
      categories: backupCategories,
      inspirations: [inspiration({ id: 'x', title: '不该写入' })],
    })

    expect(report.restored).toEqual([])
    expect(report.inspirations).toBeUndefined()
    expect(report.kept.some((label) => label.includes('无法确认目标设置状态'))).toBe(true)
    expect(report.reasons.some((reason) => reason.includes('笔记库还没打开'))).toBe(true)
  })

  it('失败后重试：修复目标文件后再次恢复可以落盘', async () => {
    useRoot('restore-retry')
    h.files.set(BODY_GROUPS, '{ broken')

    const backupBody = clone(BUILTIN_BODY_GROUPS).map((group: BodyGroup) =>
      group.id === 'body-character' ? { ...group, markdown: '备份里的骨架' } : group,
    )
    const first = await restoreBackupConfig({ bodyGroups: backupBody })
    expect(first.restored).toEqual([])
    expect(first.kept).toContain('正文组')

    // 故障解除：目标文件恢复成合法的出厂内容
    h.files.set(
      BODY_GROUPS,
      JSON.stringify({ version: 1, groups: clone(BUILTIN_BODY_GROUPS) }),
    )
    const second = await restoreBackupConfig({ bodyGroups: backupBody })
    expect(second.restored).toContain('正文组')
    expect(getBodyGroups().find((group) => group.id === 'body-character')?.markdown).toBe(
      '备份里的骨架',
    )
  })
})
