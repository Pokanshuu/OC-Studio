import { useSyncExternalStore } from 'react'
import { db } from '@/lib/db'
import { isVaultSupported, vaultFs } from '@/lib/vault/vault-fs'
import { getVaultSession } from '@/lib/vault/vault-session'
import { defaultFieldConfig, defaultFields } from './defaults'
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
const FIELDS_VERSION = 1

let snapshot: FieldConfig = defaultFieldConfig()
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

/** 把任意来源的数据收成合法配置：坏条目丢弃、内置字段补回默认 label/type */
function normalize(raw: unknown): FieldConfig {
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

/** 字段表 → `.ocstudio/fields.json` 的原文（迁移时也要用它，所以导出） */
export function serializeFieldConfig(config: FieldConfig): string {
  const payload: Record<string, unknown> = { version: FIELDS_VERSION }
  for (const kind of FIELD_KINDS) {
    payload[kind] = config[kind].map((field) =>
      field.key === undefined
        ? { id: field.id, label: field.label }
        : { id: field.id, label: field.label, key: field.key },
    )
  }
  return `${JSON.stringify(payload, null, 2)}\n`
}

/** 读配置：有文件夹时读 `.ocstudio/fields.json`，没有（浏览器预览）读 meta；读不到就是默认（全字段可见） */
export async function loadFieldConfig(): Promise<void> {
  const session = getVaultSession()
  try {
    if (session !== null && isVaultSupported()) {
      if (await vaultFs.exists(session.root, FIELDS_REL_PATH)) {
        const bytes = await vaultFs.readBytes(session.root, FIELDS_REL_PATH)
        snapshot = normalize(JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))))
      } else {
        snapshot = defaultFieldConfig()
      }
    } else {
      const row = await db.meta.get(1)
      snapshot = row?.fields === undefined ? defaultFieldConfig() : normalize(row.fields)
    }
  } catch {
    snapshot = defaultFieldConfig()
  }
  emit()
}

/** 写配置：先更新内存（界面立刻生效），再落盘；落盘失败抛出给调用方提示 */
export async function saveFieldConfig(next: FieldConfig): Promise<void> {
  snapshot = next
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
      fields: next,
    })
    return
  }
  await db.meta.update(1, { fields: next })
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
