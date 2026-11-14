import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * F15 正式回归：灵感 + 分类空文件夹进备份、能恢复，而且恢复策略是保守的。
 *
 * 三组断言：
 * 1. 导出 → 全新环境恢复：灵感正文与按分类分组的空文件夹都回来；
 * 2. 重复导入：同一份备份导两次不会越长越多；
 * 3. 已有内容冲突 / 目标已有设置：本地创作一个字不动，冲突另存并在报告里点名。
 */

vi.mock('@/lib/vault/vault-fs', () => ({ isVaultSupported: () => false, vaultFs: {} }))
vi.mock('@/lib/db', () => ({
  db: {
    meta: {
      get: async () => undefined,
      put: async () => 1,
      update: async () => 1,
    },
  },
}))

import { BUILTIN_TEMPLATES } from '@/lib/templates/defaults'
import { loadTemplates, saveTemplates } from '@/lib/templates/store'
import { BUILTIN_INFO_GROUPS, loadInfoGroups, saveInfoGroups } from '@/lib/templates/info-groups'
import { BUILTIN_BODY_GROUPS, getBodyGroups, loadBodyGroups, saveBodyGroups } from '@/lib/templates/body-groups'
import { BUILTIN_CATEGORIES } from '@/lib/categories/builtins'
import { getCategories, loadCategories, saveCategories } from '@/lib/categories/store'
import { defaultFieldConfig } from '@/lib/fields/defaults'
import { loadFieldConfig, saveFieldConfig } from '@/lib/fields/store'
import { loadFolderRegistry, saveFolderRegistry } from '@/features/characters/folders'
import {
  countEmptyWorldFolders,
  createWorldFolder,
  getWorldFolderRegistry,
  loadWorldFolderRegistry,
  saveWorldFolderRegistry,
} from '@/features/categories/folders'
import {
  createInspiration,
  getInspirations,
  loadInspirations,
  resetInspirations,
  updateInspiration,
} from '@/features/inspirations/store'
import { INSPIRATIONS_LS_KEY } from '@/features/inspirations/types'
import type { Inspiration } from '@/features/inspirations/types'
import type { WorldEntry } from '@/types'
import { collectBackupConfig, isConfigUntouched, restoreBackupConfig } from '@/lib/export/backup-config'

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

function inspiration(over: Partial<Inspiration> & Pick<Inspiration, 'id'>): Inspiration {
  return {
    title: '',
    content: '<p></p>',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...over,
  }
}

function entry(id: number, category: string, folder?: string): WorldEntry {
  return {
    id,
    title: `条目 ${id}`,
    content: '',
    category,
    folder,
    parentId: null,
    order: 0,
    isConcept: false,
    relations: [],
    references: [],
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    _syncStatus: 'synced',
    _lastModified: 0,
  }
}

beforeEach(async () => {
  await resetToFactory()
})

describe('F15 · 灵感与分类空文件夹的导出 → 全新环境恢复', () => {
  it('导出快照带灵感正文与按分类分组的空文件夹，工厂环境能完整恢复', async () => {
    // 源环境：开启内置分类、建两个空文件夹、写一条灵感
    await saveCategories(
      getCategories().map((category) => (category.id === 'cat-pet' ? { ...category, enabled: true } : category)),
    )
    await createWorldFolder('宠物', '空夹甲')
    await createWorldFolder('武器', '空夹乙')
    const draft = await createInspiration()
    await updateInspiration(draft.id, { title: '雨夜', content: '<p>塔顶的信号灯</p>' })

    const config = await collectBackupConfig()

    // 导出侧：正文与分组清单都在，不是只有实体数量
    expect(config.inspirations?.map((item) => item.title)).toContain('雨夜')
    expect(config.inspirations?.find((item) => item.title === '雨夜')?.content).toBe('<p>塔顶的信号灯</p>')
    expect(config.worldFolders).toEqual({ 宠物: ['空夹甲'], 武器: ['空夹乙'] })
    expect(config.categories?.find((category) => category.id === 'cat-pet')?.enabled).toBe(true)

    // 全新环境 = 工厂默认 + 空内容
    await resetToFactory()
    expect(isConfigUntouched()).toBe(true)
    expect(getInspirations()).toEqual([])
    expect(getWorldFolderRegistry()).toEqual({})

    const report = await restoreBackupConfig(config)

    expect(report.restored).toEqual(expect.arrayContaining(['分类', '分类空文件夹清单']))
    expect(report.restored.some((label) => label.startsWith('灵感'))).toBe(true)
    expect(report.inspirations).toMatchObject({ incoming: 1, added: 1, skipped: 0, conflicts: 0 })

    expect(getCategories().find((category) => category.id === 'cat-pet')?.enabled).toBe(true)
    expect(getWorldFolderRegistry()).toEqual({ 宠物: ['空夹甲'], 武器: ['空夹乙'] })
    const restored = getInspirations()
    expect(restored).toHaveLength(1)
    expect(restored[0].title).toBe('雨夜')
    expect(restored[0].content).toBe('<p>塔顶的信号灯</p>')
  })

  it('重复导入同一份备份：灵感不重复、空文件夹不叠加', async () => {
    const backup = {
      worldFolders: { 宠物: ['空夹甲'] },
      inspirations: [inspiration({ id: 'insp-1', title: '旧点子', content: '<p>一句草稿</p>' })],
    }

    const first = await restoreBackupConfig(backup)
    expect(first.inspirations).toMatchObject({ incoming: 1, added: 1, skipped: 0, conflicts: 0 })

    const second = await restoreBackupConfig(backup)
    expect(second.inspirations).toMatchObject({ incoming: 1, added: 0, skipped: 1, conflicts: 0 })
    expect(second.kept.some((label) => label.startsWith('灵感'))).toBe(true)

    expect(getInspirations()).toHaveLength(1)
    expect(getInspirations()[0].content).toBe('<p>一句草稿</p>')
    expect(getWorldFolderRegistry()).toEqual({ 宠物: ['空夹甲'] })
  })

  it('已有内容冲突：同 id 不同内容保留双方并报告，再导一次不会再多出一份', async () => {
    localStorage.setItem(
      INSPIRATIONS_LS_KEY,
      JSON.stringify({
        version: 1,
        items: [inspiration({ id: 'shared', title: '本地版', content: '<p>本地改过的</p>', updatedAt: 2 })],
      }),
    )
    resetInspirations()
    await loadInspirations()

    const backup = {
      inspirations: [
        inspiration({ id: 'shared', title: '备份版', content: '<p>备份里的原文</p>', updatedAt: 3 }),
      ],
    }

    const first = await restoreBackupConfig(backup)
    expect(first.inspirations).toMatchObject({ incoming: 1, added: 1, skipped: 0, conflicts: 1 })
    expect(first.restored.some((label) => label.includes('冲突另存 1 条'))).toBe(true)

    const items = getInspirations()
    expect(items).toHaveLength(2)
    // 本地那条一个字不动；备份那条另存副本，两份都留着
    expect(items.find((item) => item.id === 'shared')?.content).toBe('<p>本地改过的</p>')
    expect(items.find((item) => item.id === 'shared~restored')?.content).toBe('<p>备份里的原文</p>')

    const second = await restoreBackupConfig(backup)
    expect(second.inspirations).toMatchObject({ incoming: 1, added: 0, skipped: 1, conflicts: 1 })
    expect(getInspirations()).toHaveLength(2)
  })

  it('目标已有设置时：设置整段保留，但灵感仍然合并（不因「已有设置」被静默跳过）', async () => {
    // 目标自己改过正文骨架（= 已配置），并且已经有一条自己的灵感
    await saveBodyGroups(
      getBodyGroups().map((group) =>
        group.id === 'body-character' ? { ...group, markdown: '目标自己的骨架' } : group,
      ),
    )
    const mine = await createInspiration()
    await updateInspiration(mine.id, { title: '我的草稿', content: '<p>别动我</p>' })

    const report = await restoreBackupConfig({
      bodyGroups: clone(BUILTIN_BODY_GROUPS).map((group) =>
        group.id === 'body-character' ? { ...group, markdown: '备份里的骨架' } : group,
      ),
      inspirations: [inspiration({ id: 'from-backup', title: '备份灵感', content: '<p>备份正文</p>' })],
    })

    // 设置：整段保留，备份不覆盖
    expect(report.kept).toContain('正文组')
    expect(getBodyGroups().find((group) => group.id === 'body-character')?.markdown).toBe('目标自己的骨架')

    // 灵感：照常合并，本地创作不被覆盖
    expect(report.inspirations).toMatchObject({ incoming: 1, added: 1, skipped: 0, conflicts: 0 })
    const titles = getInspirations().map((item) => item.title)
    expect(titles).toEqual(expect.arrayContaining(['我的草稿', '备份灵感']))
    expect(getInspirations().find((item) => item.title === '我的草稿')?.content).toBe('<p>别动我</p>')
  })

  it('旧备份（没有灵感 / 分类空文件夹键）照常恢复设置', async () => {
    const report = await restoreBackupConfig({ bodyGroups: clone(BUILTIN_BODY_GROUPS) })
    expect(report.restored).toContain('正文组')
    expect(report.inspirations).toBeUndefined()
    expect(report.kept).toEqual([])
  })

  it('没有设置段 / 只有设置段两种旧形状都不抛错', async () => {
    await expect(restoreBackupConfig(undefined)).resolves.toEqual({
      restored: [],
      kept: [],
      reasons: [],
    })
    await expect(restoreBackupConfig({})).resolves.toEqual({ restored: [], kept: [], reasons: [] })
  })

  it('目标已有分类文件夹时整段保留，报告点名原因', async () => {
    await saveBodyGroups(
      getBodyGroups().map((group) =>
        group.id === 'body-character' ? { ...group, markdown: '目标自己的骨架' } : group,
      ),
    )
    await saveWorldFolderRegistry({ 宠物: ['本地空夹'] })

    const report = await restoreBackupConfig({ worldFolders: { 宠物: ['备份空夹'] } })

    expect(getWorldFolderRegistry()).toEqual({ 宠物: ['本地空夹'] })
    expect(report.kept).toContain('分类空文件夹清单')
    expect(report.reasons.some((reason) => reason.includes('分类文件夹清单'))).toBe(true)
  })
})

describe('countEmptyWorldFolders', () => {
  it('按分类区分同名文件夹，只数真的没有条目的', () => {
    const folderMap = { 宠物: ['甲', '乙'], 武器: ['甲'] }
    const entries = [entry(1, '宠物', '甲'), entry(2, '武器'), entry(3, '宠物', '乙')]
    // 宠物：甲 / 乙 都有成员 → 0；武器：甲 没有成员 → 1
    expect(countEmptyWorldFolders(folderMap, entries)).toBe(1)
  })

  it('未分组与已删除条目不把空文件夹误算成有成员', () => {
    const folderMap = { 宠物: ['甲'] }
    const deleted = { ...entry(1, '宠物', '甲'), deleted: true }
    expect(countEmptyWorldFolders(folderMap, [deleted, entry(2, '宠物')])).toBe(1)
  })
})
