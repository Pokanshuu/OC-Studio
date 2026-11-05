'use client'

/**
 * 基本信息组件（InfoGroup）—— **独立于模板**的一组字段。
 *
 * 模板的「基本信息」只是**选择**一个组件（`info.params.group = <id>`）；
 * 组件自己有名有字段，可以被多个模板复用，名字和模板名没有任何绑定。
 * 关系只由「选择了哪一个」决定。
 *
 * 存储：`.ocstudio/info-groups.json`（随库走）；浏览器 Mock 退 localStorage。
 * 内置组件（宠物 / 武器）始终合并进表，用户可以改字段 / 改名，但不能删。
 */
import { useEffect, useSyncExternalStore } from 'react'
import { BUILTIN_FIELDS } from '@/lib/fields/defaults'
import { isVaultSupported, vaultFs } from '@/lib/vault/vault-fs'
import { getVaultSession } from '@/lib/vault/vault-session'

const LS_KEY = 'oc-info-groups-v1'
export const INFO_GROUPS_REL_PATH = '.ocstudio/info-groups.json'
const REL_PATH = INFO_GROUPS_REL_PATH
const VERSION = 1

export type InfoGroupHost = 'character' | 'event' | 'world' | 'note'

/**
 * 笔记型字段的控件类型（列型宿主不用它 —— 那边的控件由 `lib/fields` 的 `FieldDef.type` 决定）。
 *
 * 只有五种：写作面上真正需要区分的就这几类，再往上加就变成表单设计器了（`docs/模板.md §12`）。
 * 存成字符串，读回来认不出来的一律回 `text`，不因为一个坏值把整份组件读废。
 */
export type InfoFieldType = 'text' | 'longtext' | 'number' | 'date' | 'boolean'

export const INFO_FIELD_TYPE_LABELS: Record<InfoFieldType, string> = {
  text: '单行',
  longtext: '多行',
  number: '数字',
  date: '日期',
  boolean: '开关',
}

const INFO_FIELD_TYPES: InfoFieldType[] = ['text', 'longtext', 'number', 'date', 'boolean']

export function isInfoFieldType(value: unknown): value is InfoFieldType {
  return typeof value === 'string' && (INFO_FIELD_TYPES as string[]).includes(value)
}

export interface InfoGroup {
  /** 稳定 id；模板只存它 */
  id: string
  /** 用户可改的名字，与模板名无关 */
  name: string
  /** 有序字段键（键 = frontmatter 同名键，值落 WorldEntry.custom） */
  fields: string[]
  /** 字段键 → 控件类型；缺省 / 未知一律 `text`。只对笔记型宿主生效（列型的控件归 `lib/fields`） */
  types?: Record<string, InfoFieldType>
  /** 字段键 → **显示名**（缺省 = 键名）。键是落盘 / frontmatter 用的，显示名是给人看的 */
  labels?: Record<string, string>
  /** 内置组件：可改、不可删（删了下次读盘会回来） */
  builtin?: boolean
  /**
   * 宿主：这份字段属于哪类实体。
   *
   * - `character` / `event` / `world`：字段是**实体列 id**（`race` / `birthday`），
   *   值读列、控件由 `lib/fields/defaults.ts` 的 `type` 决定
   * - `note`：字段是**自建键**（物种 / 材质），值落 `WorldEntry.custom`
   *
   * 它只决定「哪些模板能选到这份组件」，不改变字段的读写方式。
   */
  for?: InfoGroupHost
}

/** 内置基本信息组件：宠物 / 武器的出厂字段表 */
export const BUILTIN_INFO_GROUPS: InfoGroup[] = [
  {
    id: 'group-character',
    name: '角色',
    builtin: true,
    for: 'character',
    fields: BUILTIN_FIELDS.character.map((field) => field.id),
  },
  {
    id: 'group-event',
    name: '事件',
    builtin: true,
    for: 'event',
    fields: BUILTIN_FIELDS.event.map((field) => field.id),
  },
  {
    id: 'group-world',
    name: '词条',
    builtin: true,
    for: 'world',
    fields: BUILTIN_FIELDS.worldEntry.map((field) => field.id),
  },
  {
    id: 'group-pet',
    name: '宠物',
    builtin: true,
    for: 'note',
    fields: [
      '物种',
      '品种',
      '性别',
      '年龄',
      '体型',
      '体重',
      '外观特征',
      '性格',
      '习性',
      '饮食偏好',
      '能力技能',
      '出生日期',
      '收养日期',
      '栖息地',
      '当前状态',
    ],
    // 出厂就给几项非单行：这几列天生是多行 / 数字 / 日期，别让用户一个个点
    types: {
      年龄: 'number',
      体重: 'number',
      外观特征: 'longtext',
      性格: 'longtext',
      习性: 'longtext',
      能力技能: 'longtext',
      出生日期: 'date',
      收养日期: 'date',
    },
  },
  {
    id: 'group-weapon',
    name: '武器',
    builtin: true,
    for: 'note',
    fields: [
      '武器类型',
      '材质',
      '稀有度',
      '尺寸',
      '重量',
      '制造者',
      '铸造时间',
      '来源',
      '使用条件',
      '能力效果',
      '属性元素',
      '当前状态',
    ],
    types: {
      重量: 'number',
      铸造时间: 'date',
      使用条件: 'longtext',
      能力效果: 'longtext',
    },
  },
]

export function isBuiltinInfoGroup(id: string): boolean {
  return BUILTIN_INFO_GROUPS.some((group) => group.id === id)
}

/** 内置组件的宿主以代码为准；自建组件才认记录里写的 */
function hostOf(id: string, recordFor: unknown): InfoGroupHost | undefined {
  const builtin = BUILTIN_INFO_GROUPS.find((group) => group.id === id)
  if (builtin) return builtin.for
  return recordFor === 'character' || recordFor === 'event' || recordFor === 'world' || recordFor === 'note'
    ? recordFor
    : undefined
}

/** 列型宿主的字段必须是真实存在的实体列；不认识的键直接丢，避免界面上出现死行 */
function knownColumnKeys(host: InfoGroupHost | undefined, fields: string[]): string[] {
  if (host === 'note' || host === undefined) return fields
  const kind = host === 'character' ? 'character' : host === 'event' ? 'event' : 'worldEntry'
  const known = new Set(BUILTIN_FIELDS[kind].map((field) => field.id))
  return fields.filter((field) => known.has(field))
}
/**
 * 顺序与显示范围的**归属**（定死，别再猜）：
 *
 * - **列型宿主**（角色 / 事件 / 词条）：唯一源是 `lib/fields` 的 `FieldConfig`
 *   —— 显示哪些字段、什么顺序都由字段表编辑器说了算。组件里那一份只是**投影**，
 *   读回时直接按内置默认重建，忽略盘上的值（盘上写了也不作数）。
 * - **笔记型宿主**（宠物 / 武器 / 自建）：组件就是唯一源，字段顺序随组件走。
 */
function projectColumnFields(id: string, fallback: string[]): string[] {
  const builtin = BUILTIN_INFO_GROUPS.find((group) => group.id === id)
  if (builtin === undefined) return fallback
  if (builtin.for === 'note' || builtin.for === undefined) return fallback
  return [...builtin.fields]
}
function clone(group: InfoGroup): InfoGroup {
  return {
    ...group,
    fields: [...group.fields],
    ...(group.types ? { types: { ...group.types } } : {}),
    ...(group.labels ? { labels: { ...group.labels } } : {}),
  }
}

/** 只留字段表里真实存在的键，且类型必须是认识的五种之一 */
function normalizeTypes(raw: unknown, fields: readonly string[]): Record<string, InfoFieldType> | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const known = new Set(fields)
  const out: Record<string, InfoFieldType> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!known.has(key) || !isInfoFieldType(value) || value === 'text') continue
    out[key] = value
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** 显示名：只留存在的键、非空、且不等于键名（等于键名的没必要存） */
function normalizeLabels(raw: unknown, fields: readonly string[]): Record<string, string> | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const known = new Set(fields)
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!known.has(key) || typeof value !== 'string') continue
    const label = value.trim()
    if (label === '' || label === key) continue
    out[key] = label
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** 某个字段的控件类型：没设 / 设坏 = 单行 */
export function infoFieldTypeOf(group: InfoGroup | undefined, key: string): InfoFieldType {
  const type = group?.types?.[key]
  return isInfoFieldType(type) ? type : 'text'
}

/** 某个字段的显示名：没设 = 键名（键从来没有显示名这个概念，别在渲染处各猜一遍） */
export function infoFieldLabelOf(group: InfoGroup | undefined, key: string): string {
  const label = group?.labels?.[key]
  return typeof label === 'string' && label.trim() !== '' ? label : key
}

/** 内置 + 盘上：同 id 以盘上为准（改名 / 改字段都能持久化），自定义追加在后 */
function merge(saved: InfoGroup[]): InfoGroup[] {
  const byId = new Map<string, InfoGroup>()
  for (const group of BUILTIN_INFO_GROUPS) byId.set(group.id, clone(group))
  for (const group of saved) byId.set(group.id, { ...group, builtin: group.builtin ?? isBuiltinInfoGroup(group.id) })
  return [...byId.values()]
}

function normalize(raw: unknown): InfoGroup[] {
  if (!Array.isArray(raw)) return []
  const out: InfoGroup[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (id === '' || name === '' || seen.has(id)) continue
    seen.add(id)
    const fields = Array.isArray(record.fields)
      ? [...new Set(record.fields.filter((field): field is string => typeof field === 'string').map((field) => field.trim()).filter((field) => field !== ''))]
      : []
    const host = hostOf(id, record.for)
    const projected = projectColumnFields(id, knownColumnKeys(host, fields))
    // 列型宿主的控件归字段表，组件里存的类型 / 显示名不作数（那边的 label 在 FieldConfig 里）
    const noteHost = host === 'note' || host === undefined
    const types = noteHost ? normalizeTypes(record.types, projected) : undefined
    const labels = noteHost ? normalizeLabels(record.labels, projected) : undefined
    out.push({
      id,
      name,
      fields: projected,
      ...(types ? { types } : {}),
      ...(labels ? { labels } : {}),
      builtin: record.builtin === true || isBuiltinInfoGroup(id),
      ...(host !== undefined ? { for: host } : {}),
    })
  }
  return out
}

/** 给读盘脚本用：盘上的 groups → 合并内置后的完整表 */
export function normalizeInfoGroups(raw: unknown): InfoGroup[] {
  return merge(normalize(raw))
}

function serialize(groups: InfoGroup[]): string {
  return `${JSON.stringify({ version: VERSION, groups }, null, 2)}\n`
}

let snapshot: InfoGroup[] = merge([])
let loaded = false
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function vaultRoot(): string | null {
  if (!isVaultSupported()) return null
  return getVaultSession()?.root ?? null
}

export async function loadInfoGroups(force = false): Promise<void> {
  if (loading) return loading
  if (loaded && !force) return
  loading = (async () => {
    try {
      const root = vaultRoot()
      if (root) {
        if (await vaultFs.exists(root, REL_PATH)) {
          const bytes = await vaultFs.readBytes(root, REL_PATH)
          const payload = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as { groups?: unknown }
          snapshot = merge(normalize(payload?.groups))
        } else {
          snapshot = merge([])
        }
      } else if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(LS_KEY)
        snapshot = merge(raw === null ? [] : normalize((JSON.parse(raw) as { groups?: unknown })?.groups))
      }
    } catch {
      snapshot = merge([])
    } finally {
      loaded = true
      loading = null
      emit()
    }
  })()
  return loading
}

export async function saveInfoGroups(next: InfoGroup[]): Promise<void> {
  const merged = merge(normalize(next))
  snapshot = merged
  loaded = true
  emit()

  const root = vaultRoot()
  if (root) {
    try {
      await vaultFs.mkdir(root, '.ocstudio')
    } catch {
      // 目录已存在时可能抛错，忽略
    }
    const results = await vaultFs.writeTexts(root, [{ relPath: REL_PATH, content: serialize(merged) }])
    const failed = results.find((result) => !result.ok)
    if (failed !== undefined) throw new Error(failed.error ?? '写入基本信息组件失败')
    return
  }
  if (typeof window !== 'undefined') localStorage.setItem(LS_KEY, serialize(merged))
}

export function getInfoGroups(): InfoGroup[] {
  return snapshot
}

export function findInfoGroup(id: string): InfoGroup | undefined {
  return snapshot.find((group) => group.id === id)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useInfoGroups(): InfoGroup[] {
  useEffect(() => {
    void loadInfoGroups()
  }, [])
  return useSyncExternalStore(subscribe, getInfoGroups, getInfoGroups)
}

export function newInfoGroupId(): string {
  return `group-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

export async function createInfoGroup(input: { name: string; fields?: string[] }): Promise<InfoGroup> {
  const name = input.name.trim()
  if (name === '') throw new Error('基本信息组件名不能为空')
  if (snapshot.some((group) => group.name === name)) throw new Error(`已经有叫「${name}」的基本信息组件了`)
  const group: InfoGroup = { id: newInfoGroupId(), name, fields: input.fields ?? [] }
  await saveInfoGroups([...snapshot, group])
  return group
}

export async function updateInfoGroup(id: string, patch: Partial<Omit<InfoGroup, 'id' | 'builtin'>>): Promise<void> {
  await saveInfoGroups(
    snapshot.map((group) =>
      group.id === id
        ? { ...group, ...patch, name: (patch.name ?? group.name).trim() || group.name, fields: patch.fields ?? group.fields }
        : group,
    ),
  )
}

/** 内置组件不删；自定义组件删掉后，引用它的模板会退回「未选择」 */
export async function deleteInfoGroup(id: string): Promise<void> {
  if (isBuiltinInfoGroup(id)) throw new Error('内置基本信息组件不能删除')
  await saveInfoGroups(snapshot.filter((group) => group.id !== id))
}

/**
 * 模板 → 宿主。只认内置模板的 id；用户复制的模板继承原 id 前缀（`character-2`），
 * 因此按前缀匹配。认不出来就当没有宿主（可选全部组件）。
 */
export function infoGroupHostOfTemplate(templateId: string): InfoGroupHost | undefined {
  const id = templateId.trim().toLowerCase()
  if (id.startsWith('character')) return 'character'
  if (id.startsWith('event')) return 'event'
  if (id.startsWith('entry') || id.startsWith('world')) return 'world'
  if (id.startsWith('pet') || id.startsWith('weapon') || id.startsWith('country')) return 'note'
  return undefined
}

/** 某套模板能选的基本信息组件：宿主要么相同、要么没标宿主（自建的老组件） */
export function selectableInfoGroups(templateId: string, groups: readonly InfoGroup[]): InfoGroup[] {
  const host = infoGroupHostOfTemplate(templateId)
  if (host === undefined) return [...groups]
  return groups.filter((group) => group.for === undefined || group.for === host)
}