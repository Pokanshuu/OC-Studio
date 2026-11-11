/**
 * `.ocbak` 里的「设置」段：自定义分类 / 字段表 / 模板 / 信息组 / 正文组 / 文件夹清单。
 *
 * 为什么需要它：这些设置存在 `.ocstudio/`（浏览器预览里是 localStorage），
 * 以前不进单文件备份 —— 换台机器只导 `.ocbak`，笔记都在、设置全没了。
 *
 * **恢复规则（与用户 2026-11-11 拍板一致）：只在目标「还是空的」时整段恢复**。
 * 判断口径每一项都取保守值（有任何自建 / 改过就算非空），只要有一项非空就整段跳过、
 * 并在报告里写「保留当前」。合并同名分类 / 模板没有公认语义，不猜。
 */
import { BUILTIN_TEMPLATES } from '@/lib/templates/defaults'
import { getTemplates, saveTemplates } from '@/lib/templates/store'
import { getInfoGroups, saveInfoGroups, isBuiltinInfoGroup, type InfoGroup } from '@/lib/templates/info-groups'
import { getBodyGroups, saveBodyGroups, isBuiltinBodyGroup, type BodyGroup } from '@/lib/templates/body-groups'
import { getCategories, saveCategories } from '@/lib/categories/store'
import type { Category } from '@/lib/categories/types'
import { defaultFieldConfig } from '@/lib/fields/defaults'
import { getFieldConfig, saveFieldConfig } from '@/lib/fields/store'
import type { FieldConfig } from '@/lib/fields/types'
import { getFolderRegistry, saveFolderRegistry } from '@/features/characters/folders'
import type { TemplateDoc } from '@/lib/templates/types'

export interface BackupConfig {
  /** 分类表（含内置项；恢复时整表替换） */
  categories?: Category[]
  /** 字段表（`.ocstudio/fields.json` 的内容） */
  fields?: FieldConfig
  /** 模板（`TemplateDoc` 数组；写回时会各自落成 `.ocstudio/templates/*.md`） */
  templates?: TemplateDoc[]
  infoGroups?: InfoGroup[]
  bodyGroups?: BodyGroup[]
  /** 角色文件夹清单（只存名字） */
  folders?: string[]
}

export interface RestoreConfigReport {
  /** 恢复了哪几项（给人看的短名） */
  restored: string[]
  /** 因为目标已有设置而跳过 */
  kept: string[]
}

/** 导出时把当前六份设置读出来（都走各 store 的内存快照，不额外读盘） */
export function collectBackupConfig(): BackupConfig {
  return {
    categories: getCategories(),
    fields: getFieldConfig(),
    templates: getTemplates(),
    infoGroups: getInfoGroups(),
    bodyGroups: getBodyGroups(),
    folders: getFolderRegistry(),
  }
}

function hasCustomCategories(): boolean {
  return getCategories().some((category) => category.builtin !== true)
}

function fieldsChanged(): boolean {
  return JSON.stringify(getFieldConfig()) !== JSON.stringify(defaultFieldConfig())
}

const BUILTIN_TEMPLATE_IDS = new Set(BUILTIN_TEMPLATES.map((doc) => doc.id))

function templatesChanged(): boolean {
  for (const doc of getTemplates()) {
    if (!BUILTIN_TEMPLATE_IDS.has(doc.id)) return true
    const base = BUILTIN_TEMPLATES.find((item) => item.id === doc.id)
    if (base === undefined) continue
    // 只比组件形状（参数 / 开关）；版本号变化不算用户改动
    if (JSON.stringify(doc.components) !== JSON.stringify(base.components)) return true
  }
  return false
}

function groupsChanged<T extends { id: string }>(
  list: readonly T[],
  isBuiltin: (id: string) => boolean,
): boolean {
  return list.some((group) => !isBuiltin(group.id))
}

/** 目标库现在是不是「还没配过」：任何一项被改过都算不空 */
export function isConfigUntouched(): boolean {
  return (
    !hasCustomCategories() &&
    !fieldsChanged() &&
    !templatesChanged() &&
    !groupsChanged(getInfoGroups(), isBuiltinInfoGroup) &&
    !groupsChanged(getBodyGroups(), isBuiltinBodyGroup) &&
    getFolderRegistry().length === 0
  )
}

const LABELS: Record<keyof BackupConfig, string> = {
  categories: '分类',
  fields: '字段表',
  templates: '模板',
  infoGroups: '基本信息组',
  bodyGroups: '正文组',
  folders: '文件夹清单',
}

/**
 * 把备份里的设置恢复到当前库。
 *
 * 目标已经有任何自建 / 改动过的设置时**整段跳过**（`kept` 里如实列出），
 * 不做合并 —— 「同名分类合还是盖」没有公认答案，猜错就是覆盖用户的东西。
 */
export async function restoreBackupConfig(config: BackupConfig | undefined): Promise<RestoreConfigReport> {
  const report: RestoreConfigReport = { restored: [], kept: [] }
  if (config === undefined) return report

  const keys = (Object.keys(LABELS) as (keyof BackupConfig)[]).filter(
    (key) => config[key] !== undefined,
  )
  if (keys.length === 0) return report

  if (!isConfigUntouched()) {
    report.kept = keys.map((key) => LABELS[key])
    return report
  }

  for (const key of keys) {
    try {
      switch (key) {
        case 'categories': {
          const next = config.categories
          if (next !== undefined && next.length > 0) {
            await saveCategories(next)
            report.restored.push(LABELS[key])
          }
          break
        }
        case 'fields': {
          const next = config.fields
          if (next !== undefined) {
            await saveFieldConfig(next)
            report.restored.push(LABELS[key])
          }
          break
        }
        case 'templates': {
          const next = config.templates
          if (next !== undefined && next.length > 0) {
            await saveTemplates(next)
            report.restored.push(LABELS[key])
          }
          break
        }
        case 'infoGroups': {
          const next = config.infoGroups
          if (next !== undefined && next.length > 0) {
            await saveInfoGroups(next)
            report.restored.push(LABELS[key])
          }
          break
        }
        case 'bodyGroups': {
          const next = config.bodyGroups
          if (next !== undefined && next.length > 0) {
            await saveBodyGroups(next)
            report.restored.push(LABELS[key])
          }
          break
        }
        case 'folders': {
          const next = config.folders
          if (next !== undefined && next.length > 0) {
            await saveFolderRegistry(next)
            report.restored.push(LABELS[key])
          }
          break
        }
      }
    } catch (error) {
      // 单项失败不连坐：其余设置照常恢复，报告里把这一项记进「保留」
      console.error('[backup-config] 恢复设置失败', key, error)
      report.kept.push(LABELS[key])
    }
  }

  return report
}
