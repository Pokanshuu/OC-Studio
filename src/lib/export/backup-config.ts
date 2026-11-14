/**
 * `.ocbak` 里的「设置」段：自定义分类 / 字段表 / 模板 / 信息组 / 正文组 /
 * 角色文件夹清单 / 分类空文件夹清单，外加**灵感**（创作内容，单独一条恢复通道）。
 *
 * 为什么需要它：这些设置存在 `.ocstudio/`（浏览器预览里是 localStorage），
 * 以前不进单文件备份 —— 换台机器只导 `.ocbak`，笔记都在、设置全没了。
 *
 * **恢复规则（与用户 2026-11-11 拍板一致）：只在目标「还是空的」时整段恢复**。
 * 判断口径每一项都取保守值：**任何一项被用户改过就算非空** ——
 * 包括改内置组件 / 内置分类开关 / 模板名称、别名、参数。只要有一项非空就整段跳过、
 * 并在报告里写「保留当前」以及具体是哪一项让它不算空。
 * 合并同名分类 / 模板没有公认语义，不猜。
 *
 * 两个刻意的例外，别顺手「统一」：
 * 1. **版本迁移不是用户修改**：模板的 `schema`（`版本:` 键）、字段表的版本号、
 *    分类每次保存都会重排的 `order` 都不参与比较，否则一次开库迁移就会让
 *    所有目标库变成「已配置」，备份设置永远恢复不了。
 * 2. **灵感不是「设置」**：它是作者写的字，恢复时不受上面那道闸门影响，永远按
 *    `mergeInspirationsFromBackup` 做保守的幂等合并（只增不删，冲突保留双方）。
 */
import { BUILTIN_TEMPLATES } from '@/lib/templates/defaults'
import { getTemplates, getTemplatesReadState, loadTemplates, saveTemplates } from '@/lib/templates/store'
import { docFromRecord } from '@/lib/templates/serialize'
import {
  BUILTIN_INFO_GROUPS,
  getInfoGroups,
  getInfoGroupsReadState,
  loadInfoGroups,
  saveInfoGroups,
  type InfoGroup,
} from '@/lib/templates/info-groups'
import {
  BUILTIN_BODY_GROUPS,
  getBodyGroups,
  getBodyGroupsReadState,
  loadBodyGroups,
  saveBodyGroups,
  type BodyGroup,
} from '@/lib/templates/body-groups'
import { loadCategories, getCategories, getCategoriesReadState, saveCategories } from '@/lib/categories/store'
import { BUILTIN_CATEGORIES } from '@/lib/categories/builtins'
import type { Category } from '@/lib/categories/types'
import { defaultFieldConfig } from '@/lib/fields/defaults'
import {
  getFieldConfig,
  getFieldConfigReadState,
  loadFieldConfig,
  normalizeFieldConfig,
  saveFieldConfig,
} from '@/lib/fields/store'
import type { FieldConfig } from '@/lib/fields/types'
import {
  getFolderRegistry,
  getFolderRegistryReadState,
  loadFolderRegistry,
  saveFolderRegistry,
} from '@/features/characters/folders'
import {
  getWorldFolderRegistry,
  getWorldFolderRegistryReadState,
  loadWorldFolderRegistry,
  saveWorldFolderRegistry,
} from '@/features/categories/folders'
import {
  getInspirations,
  getInspirationsReadState,
  loadInspirations,
  mergeInspirationsFromBackup,
  type InspirationMergeReport,
} from '@/features/inspirations/store'
import type { Inspiration } from '@/features/inspirations/types'
import type { TemplateDoc } from '@/lib/templates/types'
import { isVaultSupported } from '@/lib/vault/vault-fs'
import { getVaultSession } from '@/lib/vault/vault-session'

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
  /** 分类的空文件夹清单（按分类分组，只存名字） */
  worldFolders?: Record<string, string[]>
  /**
   * 灵感（正文原文 + 标题 + 时间 + 升级标记）。
   *
   * **它是创作内容，不是设置**：恢复时不走「目标已有设置就整段保留」那套，
   * 永远按 id 幂等合并，冲突另存副本。旧备份没有这个键。
   */
  inspirations?: Inspiration[]
}

export interface RestoreConfigReport {
  /** 恢复了哪几项（给人看的短名） */
  restored: string[]
  /** 因为目标已有设置而跳过 / 已经是最新的项 */
  kept: string[]
  /** 目标为什么不算「没配过」（整段保留时的具体依据；也给测试与日志看） */
  reasons: string[]
  /** 灵感合并的结构化结果（内容不受设置闸门影响） */
  inspirations?: InspirationMergeReport
}

// ── 规范化比较 ──────────────────────────────────────────────────────────
// 配置对象来自界面 / 磁盘 / 备份三处，键顺序与 `undefined` 写法都可能不同。
// 直接 JSON.stringify 比会把「同样的值、不同的键顺序」误判成用户改动。

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>()
  const walk = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(walk)
    if (item !== null && typeof item === 'object') {
      if (seen.has(item)) return null
      seen.add(item)
      const record = item as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const key of Object.keys(record).sort()) {
        if (record[key] === undefined) continue
        out[key] = walk(record[key])
      }
      return out
    }
    return item
  }
  return JSON.stringify(walk(value))
}

function canonicalInfoGroup(group: InfoGroup): Record<string, unknown> {
  return {
    id: group.id,
    name: group.name,
    fields: group.fields,
    types: group.types ?? {},
    labels: group.labels ?? {},
    builtin: group.builtin === true,
    for: group.for ?? '',
  }
}

function canonicalBodyGroup(group: BodyGroup): Record<string, unknown> {
  return {
    id: group.id,
    name: group.name,
    markdown: group.markdown,
    builtin: group.builtin === true,
    for: group.for ?? '',
  }
}

/**
 * 模板的可编辑语义：名称 / 别名 / 主题 / 组件（顺序、开关、参数）。
 *
 * **`schema` 不在里面**：它是「文件结构版本」，开库迁移会把它从 0/1 写到当前版本，
 * 那不是用户改的。参数值用稳定序列化比较，键顺序不同不算改。
 */
function canonicalTemplate(doc: TemplateDoc): Record<string, unknown> {
  return {
    id: doc.id,
    name: doc.name,
    aliases: doc.aliases ?? [],
    theme: doc.theme ?? '',
    components: doc.components.map((component) => ({
      id: component.id,
      enabled: component.enabled !== false,
      params: component.params ?? {},
    })),
  }
}

function sameInfoGroup(group: InfoGroup, base: InfoGroup): boolean {
  return stableStringify(canonicalInfoGroup(group)) === stableStringify(canonicalInfoGroup(base))
}

function sameBodyGroup(group: BodyGroup, base: BodyGroup): boolean {
  return stableStringify(canonicalBodyGroup(group)) === stableStringify(canonicalBodyGroup(base))
}

function sameTemplate(doc: TemplateDoc, base: TemplateDoc): boolean {
  return stableStringify(canonicalTemplate(doc)) === stableStringify(canonicalTemplate(base))
}

/**
 * 目标库哪些地方被用户改过（空数组 = 还没配过）。
 *
 * 比较对象是**出厂基线**而不是「有没有自建项」：改内置组件的字段 / 改名 / 改骨架、
 * 打开内置分类，都算改过。`order` 与 `schema` 不算（前者每次保存都会重排，
 * 后者是版本迁移），见文件头。
 */
export function configChangeReasons(): string[] {
  const reasons: string[] = []

  for (const category of getCategories()) {
    const base = category.builtin === true
      ? BUILTIN_CATEGORIES.find((item) => item.id === category.id)
      : undefined
    if (base === undefined) {
      reasons.push(`分类：有自建分类「${category.name}」`)
      continue
    }
    if (category.enabled !== base.enabled) {
      reasons.push(`分类：内置「${base.name}」的显示开关被改过`)
    }
    if (category.name !== base.name) {
      reasons.push(`分类：内置「${base.name}」的名字被改过`)
    }
    if (category.template !== base.template || category.icon !== base.icon) {
      reasons.push(`分类：内置「${base.name}」的模板 / 图标被改过`)
    }
  }
  // `order` 不能直接比：`saveCategories` 每次保存都会按 0..n 重排，那不是用户改动。
  // 但内置分类之间的**相对顺序**是用户能拖的（拖动排序），所以按出现顺序比一次。
  const builtinOrder = getCategories()
    .filter((category) => category.builtin === true)
    .map((category) => category.id)
  const factoryOrder = BUILTIN_CATEGORIES.map((category) => category.id).filter((id) =>
    builtinOrder.includes(id),
  )
  if (builtinOrder.join('\u0000') !== factoryOrder.join('\u0000')) {
    reasons.push('分类：内置分类之间的顺序被拖过')
  }

  const fieldsChanged = stableStringify(getFieldConfig()) !== stableStringify(defaultFieldConfig())
  if (fieldsChanged) reasons.push('字段表：字段行、顺序或显示名被改过')

  for (const doc of getTemplates()) {
    const base = BUILTIN_TEMPLATES.find((item) => item.id === doc.id)
    if (base === undefined) {
      reasons.push(`模板：有自建模板「${doc.name}」`)
      continue
    }
    if (!sameTemplate(doc, base)) {
      reasons.push(`模板：内置「${base.name}」的名称 / 别名 / 组件或参数被改过`)
    }
  }

  const builtinInfoIds = new Set(BUILTIN_INFO_GROUPS.map((group) => group.id))
  for (const group of getInfoGroups()) {
    const base = BUILTIN_INFO_GROUPS.find((item) => item.id === group.id)
    if (!builtinInfoIds.has(group.id) || base === undefined) {
      reasons.push(`基本信息组：有自建组件「${group.name}」`)
      continue
    }
    if (!sameInfoGroup(group, base)) {
      reasons.push(`基本信息组：内置「${base.name}」的字段 / 名称被改过`)
    }
  }

  const builtinBodyIds = new Set(BUILTIN_BODY_GROUPS.map((group) => group.id))
  for (const group of getBodyGroups()) {
    const base = BUILTIN_BODY_GROUPS.find((item) => item.id === group.id)
    if (!builtinBodyIds.has(group.id) || base === undefined) {
      reasons.push(`正文组：有自建组件「${group.name}」`)
      continue
    }
    if (!sameBodyGroup(group, base)) {
      reasons.push(`正文组：内置「${base.name}」的骨架 / 名称被改过`)
    }
  }

  const folders = getFolderRegistry()
  if (folders.length > 0) reasons.push(`文件夹清单：已有 ${folders.length} 个角色文件夹`)

  const worldFolders = getWorldFolderRegistry()
  const worldFolderCount = Object.values(worldFolders).reduce((sum, names) => sum + names.length, 0)
  if (worldFolderCount > 0) {
    reasons.push(`分类文件夹清单：已有 ${worldFolderCount} 个文件夹`)
  }

  return reasons
}

/**
 * 目标库现在是不是「还没配过」：任何一项被改过都算不空。
 *
 * 调用前必须先 `ensureBackupConfigLoaded()` 且确认没有 unavailable：
 * 没读到的空表 / 旧库缓存不等于用户没配过。恢复流程已经按这个顺序做。
 */
export function isConfigUntouched(): boolean {
  return configChangeReasons().length === 0
}

// ── 读取所有相关 store ─────────────────────────────────────────────────
// 分类 / 模板 / 字段组在 `AppShell` 开库时就读；分类文件夹清单只在分类页挂载时读，
// 灵感在 `VaultInspirationsSync` 里读。导出 / 恢复前统一补一次，避免：
// - 导出时把「还没读 / 读失败」当成「没有」，备份里少一段还宣称完整；
// - 恢复时把「还没读 / 读失败」当成「未配置」，把盘上的真设置覆盖掉。
//
// 各 store 的普通 `load*` 是**容错**的（读失败保留旧快照 / 回落默认，界面照常打开），
// 所以「loader resolve」不代表读成功。这里改用每个 store 暴露的**只读状态**
// （loaded / readFailed / root）核对；状态不可用时强制重读一次（失败后刷新可恢复）。

/** 备份读取状态：只读，不触发加载 */
export interface BackupConfigReadState {
  loaded: boolean
  readFailed: boolean
  root: string | null
  reason?: string
}

export type BackupConfigKey = keyof BackupConfig

/** 本次备份**没有包含**的配置段（读不到 / 状态未知）；调用方必须如实展示 */
export interface BackupConfigUnavailable {
  key: BackupConfigKey
  label: string
  reason: string
}

export interface BackupConfigSnapshot {
  config: BackupConfig
  unavailable: BackupConfigUnavailable[]
}

interface ConfigSource {
  key: BackupConfigKey
  label: string
  /** 普通加载；`force` 用于「上次读失败 / 根对不上」后强制重读一次 */
  load: (force: boolean) => Promise<void>
  state: () => BackupConfigReadState
  read: () => unknown
}

const CONFIG_SOURCES: readonly ConfigSource[] = [
  {
    key: 'categories',
    label: '分类',
    load: (force) => loadCategories(force),
    state: getCategoriesReadState,
    read: () => getCategories(),
  },
  {
    key: 'fields',
    label: '字段表',
    load: () => loadFieldConfig(),
    state: getFieldConfigReadState,
    read: () => getFieldConfig(),
  },
  {
    key: 'templates',
    label: '模板',
    load: (force) => loadTemplates(force),
    state: getTemplatesReadState,
    read: () => getTemplates(),
  },
  {
    key: 'infoGroups',
    label: '基本信息组',
    load: (force) => loadInfoGroups(force),
    state: getInfoGroupsReadState,
    read: () => getInfoGroups(),
  },
  {
    key: 'bodyGroups',
    label: '正文组',
    load: (force) => loadBodyGroups(force),
    state: getBodyGroupsReadState,
    read: () => getBodyGroups(),
  },
  {
    key: 'folders',
    label: '角色文件夹清单',
    load: (force) => loadFolderRegistry(force),
    state: getFolderRegistryReadState,
    read: () => getFolderRegistry(),
  },
  {
    key: 'worldFolders',
    label: '分类空文件夹清单',
    load: (force) => loadWorldFolderRegistry(force),
    state: getWorldFolderRegistryReadState,
    read: () => getWorldFolderRegistry(),
  },
  {
    key: 'inspirations',
    label: '灵感',
    load: (force) => loadInspirations(force),
    state: getInspirationsReadState,
    read: () => getInspirations(),
  },
]

/** 当前这次读取应该对应哪个库根；浏览器预览（不支持笔记库）为 null */
function currentReadTarget(): { vaultMode: boolean; root: string | null } {
  const vaultMode = isVaultSupported()
  return { vaultMode, root: vaultMode ? (getVaultSession()?.root ?? null) : null }
}

function unavailableIssue(source: ConfigSource, reason: string): BackupConfigUnavailable {
  return { key: source.key, label: source.label, reason }
}

/**
 * 单个 store 的严格可读性检查。
 *
 * 判定顺序：未打开笔记库 → 状态不可用（未读 / 读失败 / 根不对）就强制重读一次 →
 * 重读后仍不可用就返回原因。**不抛错**：备份要的是「这一段能不能包含」，
 * 而不是让整个导出因为一个坏文件失败。
 */
async function checkSourceReadable(source: ConfigSource): Promise<BackupConfigUnavailable | null> {
  const target = currentReadTarget()
  if (target.vaultMode && target.root === null) {
    return unavailableIssue(source, '笔记库还没打开，无法核对这一段的状态')
  }

  const usable = (state: BackupConfigReadState): boolean =>
    state.loaded && !state.readFailed && state.root === target.root

  let state = source.state()
  if (!usable(state)) {
    try {
      await source.load(true)
    } catch (error) {
      return unavailableIssue(source, messageOf(error))
    }
    // 读的过程中换了库：这一轮结果不可信，宁可标成未包含也不写进备份
    const after = currentReadTarget()
    if (after.vaultMode !== target.vaultMode || after.root !== target.root) {
      return unavailableIssue(source, '读取过程中切换了笔记库，请重试')
    }
    state = source.state()
  }

  if (!usable(state)) {
    if (!state.loaded) return unavailableIssue(source, '还没有读完')
    if (state.readFailed) return unavailableIssue(source, state.reason ?? '读取失败')
    return unavailableIssue(source, '内存里是另一个笔记库的缓存（重读后仍未对齐）')
  }
  return null
}

/**
 * 等所有相关 store 读完，并返回**不能进备份**的段。
 *
 * 返回空数组才代表「所有配置段都可核对」。普通 UI 的容错加载保持不变：
 * 这里只读各 store 的状态，不改变它们读失败后的回落行为。
 */
export async function ensureBackupConfigLoaded(): Promise<BackupConfigUnavailable[]> {
  const results = await Promise.all(
    CONFIG_SOURCES.map(async (source) => ({
      source,
      issue: await checkSourceReadable(source),
    })),
  )
  const unavailable: BackupConfigUnavailable[] = []
  for (const { source, issue } of results) {
    if (issue === null) continue
    unavailable.push(issue)
    console.warn(`[backup-config] 读取「${source.label}」不完整，本次备份不包含这一段：${issue.reason}`)
  }
  return unavailable
}

/**
 * 导出快照：**只包含可核对的段**；读不到的段整个略去，并进 `unavailable`。
 *
 * 这就是 Q05 的修复点：以前 loader 内部 catch 后正常 resolve，导出把空表 /
 * 旧库缓存当成真实配置写进 `.ocbak`，manifest 还宣称完整。
 */
export async function loadBackupConfigSnapshot(): Promise<BackupConfigSnapshot> {
  const unavailable = await ensureBackupConfigLoaded()
  const missing = new Set(unavailable.map((issue) => issue.key))
  const config: BackupConfig = {}
  for (const source of CONFIG_SOURCES) {
    if (missing.has(source.key)) continue
    ;(config as Record<string, unknown>)[source.key] = source.read()
  }
  return { config, unavailable }
}

/**
 * 兼容旧调用：只返回配置对象，把不可用项写进 `warnings`。
 *
 * 备份界面 / 测试仍可用它；需要结构化清单（manifest）的调用方用
 * `loadBackupConfigSnapshot()`。
 */
export async function collectBackupConfig(warnings: string[] = []): Promise<BackupConfig> {
  const snapshot = await loadBackupConfigSnapshot()
  for (const issue of snapshot.unavailable) {
    warnings.push(`${issue.label}没有读取成功，本次备份不包含这一段：${issue.reason}`)
  }
  return snapshot.config
}

// ── 恢复 ────────────────────────────────────────────────────────────────

/** 可整段恢复的设置项（灵感单独走合并，不在这张表里） */
type ConfigKey = Exclude<keyof BackupConfig, 'inspirations'>

const CONFIG_LABELS: Record<ConfigKey, string> = {
  categories: '分类',
  fields: '字段表',
  templates: '模板',
  infoGroups: '基本信息组',
  bodyGroups: '正文组',
  folders: '文件夹清单',
  worldFolders: '分类空文件夹清单',
}

/** 空表（空分类 / 空文件夹清单…）没有可恢复的东西，别在报告里占一行 */
function hasRestorableValue(config: BackupConfig, key: ConfigKey): boolean {
  const value = config[key]
  if (value === undefined) return false
  if (key === 'worldFolders') return Object.keys(value).length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 备份里的模板收成合法文档：坏条目丢掉，缺 `别名` / 旧键名都兜住；
 * 出厂模板永远补在最前面 —— 手改过 / 旧版本的备份可能只带了自建模板，
 * 直接 `saveTemplates` 会把内置模板从缓存里挤掉（本次会话新建条目就找不到模板名）。
 */
function normalizeBackupTemplates(list: TemplateDoc[]): TemplateDoc[] {
  const byId = new Map<string, TemplateDoc>()
  for (const base of BUILTIN_TEMPLATES) {
    byId.set(base.id, JSON.parse(JSON.stringify(base)) as TemplateDoc)
  }
  for (const item of list) {
    if (item === null || typeof item !== 'object') continue
    const doc = docFromRecord(item as unknown as Record<string, unknown>, '')
    if (doc !== null) byId.set(doc.id, doc)
  }
  return [...byId.values()]
}

/**
 * 把备份里的设置恢复到当前库。
 *
 * 目标已经有任何自建 / 改动过的设置时**整段跳过**（`kept` 里如实列出、`reasons`
 * 里写清依据），不做合并 —— 「同名分类合还是盖」没有公认答案，猜错就是覆盖用户的东西。
 *
 * 灵感例外：它是创作内容，永远合并，见 `mergeInspirationsFromBackup`。
 */
export async function restoreBackupConfig(
  config: BackupConfig | undefined,
): Promise<RestoreConfigReport> {
  const report: RestoreConfigReport = { restored: [], kept: [], reasons: [] }
  if (config === undefined) return report

  // 先核对目标状态。读失败 / 旧库缓存 / 会话没就绪都算「未知」—— 在未知状态下
  // 判断「目标是不是没配过」等于猜，猜错就是覆盖用户设置。所以整段保留。
  const unavailable = await ensureBackupConfigLoaded()
  const configUnknown = unavailable.filter((issue) => issue.key !== 'inspirations')
  const inspirationUnknown = unavailable.find((issue) => issue.key === 'inspirations')

  // 灵感合并（内容，不受设置闸门影响；但目标状态未知时同样不能写）。
  if (config.inspirations !== undefined) {
    const hasInspirations =
      !Array.isArray(config.inspirations) || config.inspirations.length > 0
    if (inspirationUnknown !== undefined) {
      if (hasInspirations) {
        report.kept.push(`灵感（目标状态未知，未合并：${inspirationUnknown.reason}）`)
        report.reasons.push(`灵感：无法确认目标状态（${inspirationUnknown.reason}），已跳过合并`)
      }
    } else {
      try {
        const merged = await mergeInspirationsFromBackup(config.inspirations)
        report.inspirations = merged
        if (merged.incoming > 0) {
          if (merged.added > 0) {
            const parts = [`新增 ${merged.added} 条`]
            if (merged.conflicts > 0) parts.push(`冲突另存 ${merged.conflicts} 条`)
            if (merged.skipped > 0) parts.push(`重复跳过 ${merged.skipped} 条`)
            report.restored.push(`灵感（${parts.join('，')}）`)
          } else {
            report.kept.push(`灵感（已是最新，跳过 ${merged.skipped} 条）`)
          }
        }
      } catch (error) {
        console.error('[backup-config] 恢复灵感失败', error)
        report.kept.push('灵感')
        report.reasons.push(`灵感：${messageOf(error)}`)
      }
    }
  }

  const keys = (Object.keys(CONFIG_LABELS) as ConfigKey[]).filter((key) =>
    hasRestorableValue(config, key),
  )
  if (keys.length === 0) return report

  if (configUnknown.length > 0) {
    report.kept.push(...keys.map((key) => CONFIG_LABELS[key]))
    for (const issue of configUnknown) {
      report.reasons.push(
        `无法确认目标「${issue.label}」的状态（${issue.reason}），为避免覆盖已整段保留`,
      )
    }
    const names = configUnknown.slice(0, 4).map((issue) => issue.label)
    report.kept.push(
      `原因：无法确认目标设置状态（${names.join('、')}${configUnknown.length > names.length ? ' 等' : ''}），已整段保留`,
    )
    return report
  }

  const reasons = configChangeReasons()
  if (reasons.length > 0) {
    report.kept.push(...keys.map((key) => CONFIG_LABELS[key]))
    report.reasons.push(...reasons)
    // 现有导入回执只会展示 `kept` 列表：把原因也放进去，用户才知道「为什么没恢复」，
    // 而不是只看到「保留当前设置」四个字。`reasons` 仍保留结构化的一份给后续界面。
    const shown = reasons.slice(0, 4)
    report.kept.push(
      `原因：${shown.join('；')}${reasons.length > shown.length ? `；等 ${reasons.length} 项` : ''}`,
    )
    return report
  }

  for (const key of keys) {
    try {
      switch (key) {
        case 'categories': {
          const next = config.categories
          if (next !== undefined && next.length > 0) {
            await saveCategories(next)
            report.restored.push(CONFIG_LABELS[key])
          }
          break
        }
        case 'fields': {
          const next = config.fields
          if (next !== undefined) {
            await saveFieldConfig(normalizeFieldConfig(next))
            report.restored.push(CONFIG_LABELS[key])
          }
          break
        }
        case 'templates': {
          const next = config.templates
          if (next !== undefined && next.length > 0) {
            const docs = normalizeBackupTemplates(next)
            if (docs.length > 0) {
              await saveTemplates(docs)
              report.restored.push(CONFIG_LABELS[key])
            }
          }
          break
        }
        case 'infoGroups': {
          const next = config.infoGroups
          if (next !== undefined && next.length > 0) {
            await saveInfoGroups(next)
            report.restored.push(CONFIG_LABELS[key])
          }
          break
        }
        case 'bodyGroups': {
          const next = config.bodyGroups
          if (next !== undefined && next.length > 0) {
            await saveBodyGroups(next)
            report.restored.push(CONFIG_LABELS[key])
          }
          break
        }
        case 'folders': {
          const next = config.folders
          if (next !== undefined && next.length > 0) {
            await saveFolderRegistry(next)
            report.restored.push(CONFIG_LABELS[key])
          }
          break
        }
        case 'worldFolders': {
          const next = config.worldFolders
          if (next !== undefined && Object.keys(next).length > 0) {
            await saveWorldFolderRegistry(next)
            report.restored.push(CONFIG_LABELS[key])
          }
          break
        }
      }
    } catch (error) {
      // 单项失败不连坐：其余设置照常恢复，报告里把这一项记进「保留」并写明原因
      console.error('[backup-config] 恢复设置失败', key, error)
      const detail = messageOf(error)
      report.kept.push(`${CONFIG_LABELS[key]}（恢复失败：${detail}）`)
      report.reasons.push(`${CONFIG_LABELS[key]}：${detail}`)
    }
  }

  return report
}
