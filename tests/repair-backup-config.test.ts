import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * F13 正式回归：**改动内置项也算「目标已经配过」**。
 *
 * 原始探针 R13–R15 只盯三种情况（内置正文骨架 / 内置字段组 / 内置分类开关），
 * 这里把同一把尺子铺到所有可编辑语义 —— 模板名称、别名、参数、版本迁移、
 * 分类顺序重排 —— 并验证「目标改过就整段保留、没改过才整段恢复」两个方向。
 */

// 只替换存储与 IPC：判定逻辑、restore 流程跑真实模块。
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
import { getTemplates, loadTemplates, saveTemplates, setTemplateComponentParam } from '@/lib/templates/store'
import { BUILTIN_INFO_GROUPS, getInfoGroups, loadInfoGroups, saveInfoGroups } from '@/lib/templates/info-groups'
import { BUILTIN_BODY_GROUPS, getBodyGroups, loadBodyGroups, saveBodyGroups } from '@/lib/templates/body-groups'
import { BUILTIN_CATEGORIES } from '@/lib/categories/builtins'
import { getCategories, loadCategories, saveCategories } from '@/lib/categories/store'
import { defaultFieldConfig } from '@/lib/fields/defaults'
import { loadFieldConfig, saveFieldConfig } from '@/lib/fields/store'
import { loadFolderRegistry, saveFolderRegistry } from '@/features/characters/folders'
import { loadWorldFolderRegistry, saveWorldFolderRegistry } from '@/features/categories/folders'
import { createInspiration, resetInspirations } from '@/features/inspirations/store'
import { configChangeReasons, isConfigUntouched, restoreBackupConfig } from '@/lib/export/backup-config'
import type { TemplateDoc } from '@/lib/templates/types'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function templateWith(overrides: (doc: TemplateDoc) => TemplateDoc): TemplateDoc[] {
  return getTemplates().map((doc) => (doc.id === 'character' ? overrides(doc) : doc))
}

/** 目标库回到「出厂默认 + 空内容」—— 也就是「从来没配过」 */
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

beforeEach(async () => {
  await resetToFactory()
})

describe('F13 · 内置项被改过就不能算「未配置」', () => {
  it('CONTROL：出厂默认 + 空内容被判为未配置', () => {
    expect(isConfigUntouched()).toBe(true)
    expect(configChangeReasons()).toEqual([])
  })

  it('CONTROL：分类只是被保存一次（order 重排）不算用户改动', async () => {
    // saveCategories 每次都会把 order 按 0..n 重排；那是实现细节，不是用户改的。
    await saveCategories(getCategories())
    expect(isConfigUntouched()).toBe(true)
  })

  it('CONTROL：有灵感不代表配置被改过（灵感是内容，不是设置）', async () => {
    await createInspiration()
    expect(isConfigUntouched()).toBe(true)
  })

  it('出厂设置保存 → 重新读盘：仍算未配置（迁移 / 序列化不冒充用户修改）', async () => {
    await saveTemplates(clone(BUILTIN_TEMPLATES))
    await saveInfoGroups(clone(BUILTIN_INFO_GROUPS))
    await saveBodyGroups(clone(BUILTIN_BODY_GROUPS))
    await saveCategories(clone(BUILTIN_CATEGORIES))
    await saveFieldConfig(defaultFieldConfig())

    await loadTemplates(true)
    await loadInfoGroups(true)
    await loadBodyGroups(true)
    await loadCategories(true)
    await loadFieldConfig()

    expect(configChangeReasons()).toEqual([])
    expect(isConfigUntouched()).toBe(true)
  })

  it('R14：改内置基本信息组的字段 → 已配置', async () => {
    await saveInfoGroups(
      getInfoGroups().map((group) =>
        group.id === 'group-pet' ? { ...group, fields: [...group.fields, '独家设定'] } : group,
      ),
    )
    expect(isConfigUntouched()).toBe(false)
    expect(configChangeReasons().some((reason) => reason.includes('基本信息组'))).toBe(true)
  })

  it('R14：内置基本信息组改名 → 已配置', async () => {
    await saveInfoGroups(
      getInfoGroups().map((group) => (group.id === 'group-pet' ? { ...group, name: '我的宠物字段' } : group)),
    )
    expect(isConfigUntouched()).toBe(false)
  })

  it('R13：改内置正文组骨架 → 已配置，恢复时整段保留', async () => {
    const own = '用户亲自写的骨架'
    await saveBodyGroups(
      getBodyGroups().map((group) => (group.id === 'body-character' ? { ...group, markdown: own } : group)),
    )
    expect(isConfigUntouched()).toBe(false)

    const report = await restoreBackupConfig({ bodyGroups: clone(BUILTIN_BODY_GROUPS) })
    expect(getBodyGroups().find((group) => group.id === 'body-character')?.markdown).toBe(own)
    expect(report.restored).toEqual([])
    expect(report.kept).toContain('正文组')
    expect(report.reasons.some((reason) => reason.includes('正文组'))).toBe(true)
  })

  it('R15：开启内置分类 → 已配置', async () => {
    await saveCategories(
      getCategories().map((category) => (category.id === 'cat-pet' ? { ...category, enabled: true } : category)),
    )
    expect(isConfigUntouched()).toBe(false)
    expect(configChangeReasons().some((reason) => reason.includes('分类'))).toBe(true)
  })

  it('拖动内置分类之间的相对顺序 → 已配置', async () => {
    // order 每次保存都会重排，不能直接比；但内置项之间的先后是用户拖出来的。

    await saveCategories(
      getCategories().map((category) =>
        category.id === 'cat-pet'
          ? { ...category, order: 2000 }
          : category.id === 'cat-weapon'
            ? { ...category, order: 0 }
            : category,
      ),
    )
    expect(isConfigUntouched()).toBe(false)
    expect(configChangeReasons().some((reason) => reason.includes('顺序'))).toBe(true)
  })

  it('改内置模板的名字 → 已配置，恢复时不覆盖', async () => {
    await saveTemplates(templateWith((doc) => ({ ...doc, name: '我的角色模板' })))
    expect(isConfigUntouched()).toBe(false)

    const report = await restoreBackupConfig({ templates: clone(BUILTIN_TEMPLATES) })
    expect(getTemplates().find((doc) => doc.id === 'character')?.name).toBe('我的角色模板')
    expect(report.kept).toContain('模板')
  })

  it('改内置模板的别名 → 已配置', async () => {
    await saveTemplates(templateWith((doc) => ({ ...doc, aliases: [...doc.aliases, '主角'] })))
    expect(isConfigUntouched()).toBe(false)
  })

  it('改内置模板的组件参数 → 已配置', async () => {
    await setTemplateComponentParam('character', 'relations', 'presentation', 'compact')
    expect(isConfigUntouched()).toBe(false)
    const doc = getTemplates().find((item) => item.id === 'character')
    expect(doc?.components.find((component) => component.id === 'relations')?.params?.presentation).toBe('compact')
  })

  it('只有 schema 版本迁移（不是用户改动）→ 仍然是未配置', async () => {
    // 旧版本文件开库会被升级成当前 schema；版本号本身不是「用户改过」。
    await saveTemplates(getTemplates().map((doc) => ({ ...doc, schema: 0 })))
    expect(isConfigUntouched()).toBe(true)
  })

  it('字段表被改 → 已配置', async () => {
    const config = defaultFieldConfig()
    await saveFieldConfig({
      ...config,
      character: [...config.character, { id: 'f-none', label: '自建字段', type: 'text', key: '自建字段' }],
    })
    expect(isConfigUntouched()).toBe(false)
  })

  it('角色文件夹 / 分类空文件夹非空 → 已配置', async () => {
    await saveFolderRegistry(['甲'])
    expect(isConfigUntouched()).toBe(false)

    await saveFolderRegistry([])
    await saveWorldFolderRegistry({ 宠物: ['空夹'] })
    expect(isConfigUntouched()).toBe(false)
    expect(configChangeReasons().some((reason) => reason.includes('分类文件夹清单'))).toBe(true)
  })
})

describe('F13 · 内置配置被改后导入', () => {
  it('目标改过 → 备份里的内置配置整段不落，用户设置原样保留', async () => {
    const ownBody = '目标自己的骨架'
    await saveBodyGroups(
      getBodyGroups().map((group) => (group.id === 'body-character' ? { ...group, markdown: ownBody } : group)),
    )
    await setTemplateComponentParam('character', 'relations', 'presentation', 'compact')

    const backupBody = clone(BUILTIN_BODY_GROUPS).map((group) =>
      group.id === 'body-character' ? { ...group, markdown: '备份里的骨架' } : group,
    )
    const backupTemplates = clone(BUILTIN_TEMPLATES).map((doc) =>
      doc.id === 'character'
        ? {
            ...doc,
            components: doc.components.map((component) =>
              component.id === 'relations'
                ? { ...component, params: { ...(component.params ?? {}), presentation: 'table' } }
                : component,
            ),
          }
        : doc,
    )
    const backupCategories = clone(BUILTIN_CATEGORIES).map((category) =>
      category.id === 'cat-pet' ? { ...category, enabled: true } : category,
    )

    const report = await restoreBackupConfig({
      bodyGroups: backupBody,
      templates: backupTemplates,
      categories: backupCategories,
    })

    expect(getBodyGroups().find((group) => group.id === 'body-character')?.markdown).toBe(ownBody)
    const relationComponent = getTemplates()
      .find((doc) => doc.id === 'character')
      ?.components.find((component) => component.id === 'relations')
    expect(relationComponent?.params?.presentation).toBe('compact')
    expect(getCategories().find((category) => category.id === 'cat-pet')?.enabled).toBe(false)

    expect(report.restored).toEqual([])
    expect(report.kept).toEqual(expect.arrayContaining(['分类', '模板', '正文组']))
    expect(report.reasons.length).toBeGreaterThan(0)
  })

  it('目标没改过 → 备份里的设置整段恢复（对照组）', async () => {
    const backupBody = clone(BUILTIN_BODY_GROUPS).map((group) =>
      group.id === 'body-character' ? { ...group, markdown: '备份里的骨架' } : group,
    )
    const backupCategories = clone(BUILTIN_CATEGORIES).map((category) =>
      category.id === 'cat-pet' ? { ...category, enabled: true } : category,
    )

    const report = await restoreBackupConfig({ bodyGroups: backupBody, categories: backupCategories })

    expect(report.restored).toEqual(expect.arrayContaining(['分类', '正文组']))
    expect(report.kept).toEqual([])
    expect(getBodyGroups().find((group) => group.id === 'body-character')?.markdown).toBe('备份里的骨架')
    expect(getCategories().find((category) => category.id === 'cat-pet')?.enabled).toBe(true)
  })
})
