import { useSyncExternalStore } from 'react'
import { db } from '@/lib/db'
import { isVaultSupported, vaultFs } from '@/lib/vault/vault-fs'
import { getVaultSession } from '@/lib/vault/vault-session'
import { setCustomFieldKeys } from '@/lib/vault/vault-field-keys'
import { defaultFieldConfig, defaultFields, missingBuiltinFields } from './defaults'
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
 */
const FIELDS_VERSION = 2

let snapshot: FieldConfig = defaultFieldConfig()
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
      const field: FieldDef = { id, label, type: builtin?.type ?? 'text' }
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
        : { id: field.id, label: field.label, key: field.key },
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
  try {
    if (session !== null && isVaultSupported()) {
      snapshot = await readFieldConfigFromRoot(session.root)
    } else {
      const row = await db.meta.get(1)
      if (row?.fields === undefined) {
        snapshot = defaultFieldConfig()
      } else {
        const { config, version } = readFieldPayload(row.fields)
        snapshot = upgradeFieldConfig(config, version)
      }
    }
  } catch {
    snapshot = defaultFieldConfig()
  }
  syncCustomFieldKeys(snapshot)
  emit()
}

/**
 * 从指定文件夹读字段表 —— **扫描之前**就要用：自定义字段键不先登记，
 * `scan` 读不回这些 frontmatter 键（`vault-load` 的会话还没建立时也要能读到）。
 */
export async function readFieldConfigFromRoot(root: string): Promise<FieldConfig> {
  try {
    if (await vaultFs.exists(root, FIELDS_REL_PATH)) {
      const bytes = await vaultFs.readBytes(root, FIELDS_REL_PATH)
      const { config, version } = readFieldPayload(
        JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))),
      )
      return upgradeFieldConfig(config, version)
    }
  } catch {
    // 坏文件回落默认：字段表坏了不能让笔记库打不开
  }
  return defaultFieldConfig()
}

/** 写配置：先更新内存（界面立刻生效），再落盘；落盘失败抛出给调用方提示 */
export async function saveFieldConfig(next: FieldConfig): Promise<void> {
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
