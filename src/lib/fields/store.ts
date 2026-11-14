import { useSyncExternalStore } from 'react'
import { db } from '@/lib/db'
import { isVaultSupported, vaultFs } from '@/lib/vault/vault-fs'
import { getVaultSession } from '@/lib/vault/vault-session'
import { setCustomFieldKeys } from '@/lib/vault/vault-field-keys'
import { DEFAULT_CUSTOM_FIELDS, defaultFieldConfig, defaultFields, missingBuiltinFields } from './defaults'
import {
  CUSTOM_FIELD_PREFIX,
  FIELD_KINDS,
  type FieldConfig,
  type FieldDef,
  type FieldKind,
} from './types'

// ── 字段配置的读写 ───────────────────────────────────────────────────────
// 有文件夹：`.ocstudio/fields.json`（跟文件夹走 —— 修真库和校园库各配一套）
// 内置数据库模式：`meta` 表那条单例记录（一个库只有一条，天然是「全局」）
//
// 读失败一律回落默认配置：配置文件坏了不能让编辑器打不开 ——
// 字段表坏了最坏情况只是「全部字段又冒出来」，不会丢数据。

export const FIELDS_REL_PATH = '.ocstudio/fields.json'
/**
 * 字段表文件版本。
 * - 1：初版
 * - 2（2026-11-10）：时间 / 结束时间 / 地点收回「基本信息」。旧配置里没有这三行
 *   （当年退役时从读盘结果里丢掉了），升级时**一次性**补回默认位置；
 *   之后用户删掉就写版本 2，不会再被加回来。
 * - 3（2026-11-13）：国家补出厂自建字段（建立时间 / 结束时间 / 政体 / 首都 /
 *   官方语言 / 货币），值落 `Country.custom`；同样只补一次。
 * - 4（2026-11-13）：建立时间 / 结束时间改成 `type: 'time'`（年 / 月 / 日三段），
 *   值仍是同一个 `YYYY-MM-DD` 字符串；旧配置里的这两行按 id / 键一次性转过来。
 */
const FIELDS_VERSION = 4

let snapshot: FieldConfig = defaultFieldConfig()
/**
 * 上一次读盘没成功（文件坏了 / IO 抖动）。
 *
 * 这种情况**不许写回**：`loadFieldConfig` 会回落默认配置，此时界面看着「所有字段都回来了」，
 * 一旦用户随手改一下并保存，盘上那份真的配置就被默认值覆盖了 —— 和分类表那个坑同一类。
 */
let readFailed = false
/** 完成过一次装载（成功或失败）；备份读取用它判断「还没读」不等于「空表」 */
let loaded = false
/** 上次装载对应的库根（浏览器模式为 null）；根对不上 = 旧库缓存，不能进备份 */
let loadedRoot: string | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

/**
 * 自定义字段键登记给 scan / serialize（它们不 import 字段表，见 `vault/vault-field-keys`）。
 * 字段表一改就得重登记，否则新加的字段既读不回来也写不出去。
 */
export function syncCustomFieldKeys(config: FieldConfig): void {
  const kinds: Partial<Record<FieldKind, string[]>> = {}
  for (const kind of FIELD_KINDS) {
    const keys = config[kind]
      .map((field) => field.key)
      .filter((key): key is string => typeof key === 'string' && key !== '')
    if (keys.length > 0) kinds[kind] = keys
  }
  setCustomFieldKeys(kinds)
}

/**
 * 已退役的内置字段：标签升级成了独立 block，不再属于「基本信息」。
 * 盘上的旧配置里还留着这一行 —— 读回时丢掉（列与已存的值都不动，只是不再出现第二个入口）。
 *
 * 时间 / 结束时间 / 地点**不在**这里（2026-11-10 收回基本信息，见 `defaults.ts`）：
 * 那三个组件退役了，它们重新成为字段表的行。
 */
const RETIRED_FIELDS: Record<FieldKind, readonly string[]> = {
  character: ['tags'],
  event: ['tags'],
  country: [],
  worldEntry: ['tags'],
}

/** 版本 2 升级时补回的内置字段（只补这几个，别的内置字段不动） */
const RESTORED_FIELDS: Record<FieldKind, readonly string[]> = {
  character: [],
  event: ['time', 'endTime', 'location'],
  country: [],
  worldEntry: [],
}

/**
 * 字段表升级：把「当年退役、现在收回」的内置字段补回默认位置。
 *
 * 只在版本落后时补一次；补完随下次保存写成当前版本，之后用户再删掉就不会被加回来
 * （和模板的 `schema` 同一个套路）。旧配置里时间 / 地点不在表里是**退役**造成的，
 * 不是用户删的 —— 那时候他们根本删不到这两行。
 */
export function upgradeFieldConfig(config: FieldConfig, version: number): FieldConfig {
  if (version >= FIELDS_VERSION) return config
  let next = config
  for (const kind of FIELD_KINDS) {
    const restored = missingBuiltinFields(kind, next[kind]).filter((field) =>
      RESTORED_FIELDS[kind].includes(field.id),
    )
    if (restored.length === 0) continue
    // 这几行原本就排在「重大事件」之前，补回时也放前面
    next = { ...next, [kind]: [...restored, ...next[kind]] }
  }

  // v3：国家补出厂自建字段。按 id **和键**去重 —— 用户已经有一条「建立时间」
  // 就不要再塞第二条；之后用户删掉也不会回来（版本已经写成 3）。
  if (version < 3) {
    const existing = new Set<string>()
    for (const field of next.country) {
      existing.add(field.id)
      if (field.key !== undefined) existing.add(field.key)
    }
    const additions = (DEFAULT_CUSTOM_FIELDS.country ?? []).filter(
      (field) => !existing.has(field.id) && (field.key === undefined || !existing.has(field.key)),
    )
    if (additions.length > 0) {
      next = {
        ...next,
        country: [...additions.map((field) => ({ ...field })), ...next.country],
      }
    }
  }

  // v4：建立 / 结束时间换成三段控件；旧配置里这两行还是 text（甚至没有 type）。
  // 按 id 和键都认，用户改过显示名也转得过来；已经是 time 的不动，保持对象身份。
  if (version < 4) {
    let changed = false
    const country = next.country.map((field) => {
      if (field.type === 'time') return field
      const isCountryTime =
        field.id === 'f_country_founded' ||
        field.id === 'f_country_dissolved' ||
        field.key === '建立时间' ||
        field.key === '结束时间'
      if (!isCountryTime) return field
      changed = true
      return { ...field, type: 'time' as const }
    })
    if (changed) next = { ...next, country }
  }
  return next
}

/** 把任意来源的数据收成合法配置：坏条目丢弃、内置字段补回默认 label/type */
export function normalizeFieldConfig(raw: unknown): FieldConfig {
  const config = defaultFieldConfig()
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return config

  const source = raw as Record<string, unknown>
  for (const kind of FIELD_KINDS) {
    const list = source[kind]
    if (!Array.isArray(list)) continue

    const builtins = new Map(defaultFields(kind).map((field) => [field.id, field]))
    const out: FieldDef[] = []
    const seen = new Set<string>()

    for (const item of list) {
      if (item === null || typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      const id = typeof record.id === 'string' ? record.id.trim() : ''
      if (id === '' || seen.has(id)) continue
      if (RETIRED_FIELDS[kind].includes(id) && typeof record.key !== 'string') continue
      seen.add(id)

      const builtin = builtins.get(id)
      const fallbackLabel = builtin?.label ?? (typeof record.key === 'string' ? record.key : id)
      const label =
        typeof record.label === 'string' && record.label.trim() !== '' ? record.label.trim() : fallbackLabel
      // 内置字段的类型由列决定；自建字段只认 time，其余一律 text。
      // 旧配置没有 type 键，这里回落 text，不影响已有字段。
      const customType = record.type === 'time' ? 'time' : 'text'
      const field: FieldDef = { id, label, type: builtin?.type ?? customType }
      if (builtin === undefined) {
        const key = typeof record.key === 'string' && record.key.trim() !== '' ? record.key.trim() : id
        field.key = key
      }
      out.push(field)
    }
    // 允许空数组（= 这一类字段全被删光），只有「不是数组」才回落默认
    config[kind] = out
  }
  return config
}

/** 字段表 → 落盘 / 落库的载荷（vault 写 JSON，浏览器模式写 meta 的同一形状） */
function fieldConfigPayload(config: FieldConfig): Record<string, unknown> {
  const payload: Record<string, unknown> = { version: FIELDS_VERSION }
  for (const kind of FIELD_KINDS) {
    payload[kind] = config[kind].map((field) =>
      field.key === undefined
        ? { id: field.id, label: field.label }
        : field.type === 'text'
          ? { id: field.id, label: field.label, key: field.key }
          : { id: field.id, label: field.label, type: field.type, key: field.key },
    )
  }
  return payload
}

/** 字段表 → `.ocstudio/fields.json` 的原文（迁移时也要用它，所以导出） */
export function serializeFieldConfig(config: FieldConfig): string {
  return `${JSON.stringify(fieldConfigPayload(config), null, 2)}\n`
}

/**
 * 读回来的载荷 → 配置 + 版本。
 * 认两种形状：`{ version, character, event, … }`（文件与现在的 meta）和裸配置
 * （早期浏览器模式的 `meta.fields` 没有版本号 → 当 0 处理，走一次升级）。
 */
function readFieldPayload(raw: unknown): { config: FieldConfig; version: number } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { config: defaultFieldConfig(), version: 0 }
  }
  const record = raw as Record<string, unknown>
  return {
    config: normalizeFieldConfig(record),
    version: typeof record.version === 'number' ? record.version : 0,
  }
}

/** 读配置：有文件夹时读 `.ocstudio/fields.json`，没有（浏览器预览）读 meta；读不到就是默认（全字段可见） */
export async function loadFieldConfig(): Promise<void> {
  const session = getVaultSession()
  const vaultMode = isVaultSupported()
  const root = vaultMode ? (session?.root ?? null) : null
  try {
    if (root !== null) {
      // 严格读：文件存在但读不出 / 坏 JSON 会抛，由下面记成 readFailed（界面仍回落默认）
      snapshot = await readFieldConfigFromRootStrict(root)
    } else if (vaultMode) {
      // 桌面版但会话还没就绪：不拿 Dexie 里的旧 meta 冒充当前库的字段表
      throw new Error('笔记库还没打开')
    } else {
      const row = await db.meta.get(1)
      if (row?.fields === undefined) {
        snapshot = defaultFieldConfig()
      } else {
        const { config, version } = readFieldPayload(row.fields)
        snapshot = upgradeFieldConfig(config, version)
      }
    }
    readFailed = false
  } catch {
    snapshot = defaultFieldConfig()
    // 读失败：记下来，之后禁止写回（否则默认值会盖掉盘上那份真配置）
    readFailed = true
  }
  loaded = true
  loadedRoot = root
  syncCustomFieldKeys(snapshot)
  emit()
}

/**
 * 备份读取用的只读状态（不触发加载）。
 * 普通界面读失败仍回落默认；备份要把这一段标成「未包含」，不能把回落值当真实配置。
 */
export interface FieldConfigReadState {
  loaded: boolean
  readFailed: boolean
  root: string | null
  reason?: string
}

export function getFieldConfigReadState(): FieldConfigReadState {
  return {
    loaded,
    readFailed,
    root: loadedRoot,
    ...(readFailed ? { reason: '字段表读取失败（权限 / 坏 JSON / 笔记库未就绪）' } : {}),
  }
}

/**
 * 严格读取：文件存在但读不出 / 不是合法 JSON 时**抛出**。
 * 普通打开路径用下面的 `readFieldConfigFromRoot`（回落默认，能开库）；
 * 备份 / 恢复用这一条，不能把坏文件当成「用户把字段全删了」。
 */
async function readFieldConfigFromRootStrict(root: string): Promise<FieldConfig> {
  if (!(await vaultFs.exists(root, FIELDS_REL_PATH))) return defaultFieldConfig()
  const bytes = await vaultFs.readBytes(root, FIELDS_REL_PATH)
  const raw = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as unknown
  // JSON 能 parse 但不是对象（null / 数组 / 字符串）也是坏文件 ——
  // 普通界面回落默认，备份不能把它当成「用户把字段全删了」。
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('字段表文件结构不正确')
  }
  const { config, version } = readFieldPayload(raw)
  return upgradeFieldConfig(config, version)
}

/**
 * 从指定文件夹读字段表 —— **扫描之前**就要用：自定义字段键不先登记，
 * `scan` 读不回这些 frontmatter 键（`vault-load` 的会话还没建立时也要能读到）。
 */
export async function readFieldConfigFromRoot(root: string): Promise<FieldConfig> {
  try {
    return await readFieldConfigFromRootStrict(root)
  } catch {
    // 坏文件回落默认：字段表坏了不能让笔记库打不开
    return defaultFieldConfig()
  }
}

/** 写配置：先更新内存（界面立刻生效），再落盘；落盘失败抛出给调用方提示 */
export async function saveFieldConfig(next: FieldConfig): Promise<void> {
  if (readFailed) throw new Error('字段表上次没有读成功，先刷新笔记库再改')
  snapshot = next
  syncCustomFieldKeys(next)
  emit()

  const session = getVaultSession()
  if (session !== null && isVaultSupported()) {
    try {
      await vaultFs.mkdir(session.root, '.ocstudio')
    } catch {
      // 目录已存在时可能抛错，忽略；写文件时还会再报一次
    }
    const results = await vaultFs.writeTexts(session.root, [
      { relPath: FIELDS_REL_PATH, content: serializeFieldConfig(next) },
    ])
    const failed = results.find((result) => !result.ok)
    if (failed !== undefined) throw new Error(failed.error ?? '写入字段配置失败')
    readFailed = false
    return
  }

  const row = await db.meta.get(1)
  if (row === undefined) {
    await db.meta.put({
      id: 1,
      worldName: '',
      tagline: '',
      coverUrl: '',
      updatedAt: Date.now(),
      fields: fieldConfigPayload(next),
    })
    return
  }
  await db.meta.update(1, { fields: fieldConfigPayload(next) })
}

export function getFieldConfig(): FieldConfig {
  return snapshot
}

export function subscribeFieldConfig(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 订阅字段表；改了配置的界面会立刻重渲染 */
export function useFieldConfig(): FieldConfig {
  return useSyncExternalStore(subscribeFieldConfig, getFieldConfig, getFieldConfig)
}

/** 某类实体当前的字段表（已可见的那部分） */
export function useFields(kind: FieldKind): FieldDef[] {
  return useFieldConfig()[kind]
}

/** 整体替换某类实体的字段表（增删改序都走它） */
export async function replaceFields(kind: FieldKind, fields: FieldDef[]): Promise<void> {
  await saveFieldConfig({ ...snapshot, [kind]: fields })
}

export function newCustomFieldId(): string {
  return `${CUSTOM_FIELD_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
