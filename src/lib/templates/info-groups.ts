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

export type InfoGroupHost = 'character' | 'event' | 'country' | 'world' | 'note'

/**
 * 笔记型字段的控件类型（列型宿主不用它 —— 那边的控件由 `lib/fields` 的 `FieldDef.type` 决定）。
 *
 * 前四种是通用的：写作面上真正需要区分的就这几类，再往上加就变成表单设计器了
 * （`docs/模板.md §12`）。**没有「多行」**：长文本归正文组件（富文本），基本信息只管
 * 结构化短字段 —— 在这里开一个多行框，等于在正文旁边再造一份长篇正文。
 *
 * 后三种是**特殊字段**（`time` / `timeEnd` / `place`）：控件是年 / 月 / 日三段与单行，
 * 但值**不落 `custom`**，直接写词条自己的列（`time` / `endTime` / `location`）。
 * 这样时间 / 地点既是「基本信息里的一行」，又仍然只有一份数据（时间线、导出读同一列）。
 * 一个组件里每种最多一个 —— 两个输入绑同一列只会互相覆盖。
 *
 * 存成字符串，读回来认不出来的一律回 `text`，不因为一个坏值把整份组件读废。
 */
export type InfoFieldType = 'text' | 'number' | 'date' | 'boolean' | 'time' | 'timeEnd' | 'place'

export const INFO_FIELD_TYPE_LABELS: Record<InfoFieldType, string> = {
  text: '单行',
  number: '数字',
  date: '日期',
  boolean: '开关',
  time: '时间',
  timeEnd: '结束时间',
  place: '地点',
}

const INFO_FIELD_TYPES: InfoFieldType[] = [
  'text',
  'number',
  'date',
  'boolean',
  'time',
  'timeEnd',
  'place',
]

/** 特殊字段类型 → 词条上的列名（值不走 `custom`） */
export const INFO_FIELD_COLUMNS: Record<'time' | 'timeEnd' | 'place', InfoFieldColumn> = {
  time: 'time',
  timeEnd: 'endTime',
  place: 'location',
}

/** 特殊字段写的列（`WorldEntry` 的同名列） */
export type InfoFieldColumn = 'time' | 'endTime' | 'location'

const SPECIAL_INFO_FIELD_TYPES = ['time', 'timeEnd', 'place'] as const

export function isSpecialInfoFieldType(type: InfoFieldType | undefined): boolean {
  return type !== undefined && (SPECIAL_INFO_FIELD_TYPES as readonly string[]).includes(type)
}

/** 字段类型 → 它绑的实体列；通用字段没有列（值落 `custom`） */
export function infoFieldColumnOf(type: InfoFieldType | undefined): InfoFieldColumn | undefined {
  return type !== undefined && isSpecialInfoFieldType(type)
    ? INFO_FIELD_COLUMNS[type as keyof typeof INFO_FIELD_COLUMNS]
    : undefined
}

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
    id: 'group-country',
    name: '国家',
    builtin: true,
    for: 'country',
    // 国家的内置列（体制 / 地理 / 文化）在正文里，字段表只有自建字段
    fields: [],
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
      '饮食偏好',
      '出生日期',
      '收养日期',
      '栖息地',
      '当前状态',
    ],
    // 出厂就给几项非单行：这几列天生是数字 / 日期，别让用户一个个点。
    // 外观 / 性格 / 习性 / 能力技能不在这里 —— 那几段是正文，不是字段。
    types: {
      年龄: 'number',
      体重: 'number',
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
      '属性元素',
      '当前状态',
    ],
    // 使用条件 / 能力效果不进字段表：两段都是正文
    types: {
      重量: 'number',
      铸造时间: 'date',
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
  return recordFor === 'character' ||
    recordFor === 'event' ||
    recordFor === 'country' ||
    recordFor === 'world' ||
    recordFor === 'note'
    ? recordFor
    : undefined
}

/** 列型宿主的字段必须是真实存在的实体列；不认识的键直接丢，避免界面上出现死行 */
function knownColumnKeys(host: InfoGroupHost | undefined, fields: string[]): string[] {
  if (host === 'note' || host === undefined) return fields
  const kind =
    host === 'character'
      ? 'character'
      : host === 'event'
        ? 'event'
        : host === 'country'
          ? 'country'
          : 'worldEntry'
  const known = new Set(BUILTIN_FIELDS[kind].map((field) => field.id))
  return fields.filter((field) => known.has(field))
}
/**
 * 顺序与显示范围的**归属**（定死，别再猜）：
 *
 * - **列型宿主**（角色 / 事件）：唯一源是 `lib/fields` 的 `FieldConfig`
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

/**
 * 只留字段表里真实存在的键，类型必须是认识的几种之一。
 *
 * 特殊类型（时间 / 结束时间 / 地点）每种只留**第一个**：它们绑的是同一条列，
 * 留两行等于两个输入抢一份数据。多出来的行退回 `text`（不删字段、不动数据）。
 */
function normalizeTypes(raw: unknown, fields: readonly string[]): Record<string, InfoFieldType> | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const known = new Set(fields)
  const out: Record<string, InfoFieldType> = {}
  const usedSpecial = new Set<string>()
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!known.has(key) || !isInfoFieldType(value) || value === 'text') continue
    if (isSpecialInfoFieldType(value)) {
      if (usedSpecial.has(value)) continue
      usedSpecial.add(value)
    }
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

/**
 * 已退役的内置组件：词条不再有全局字段表（2026-11-09，字段改由「按篇选的模板」决定）。
 * 盘上残留的这条直接丢掉 —— 它只是内置字段的投影，丢掉不碰任何数据。
 */
const RETIRED_GROUP_IDS = new Set(['group-world'])

function normalize(raw: unknown): InfoGroup[] {
  if (!Array.isArray(raw)) return []
  const out: InfoGroup[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (id === '' || name === '' || seen.has(id) || RETIRED_GROUP_IDS.has(id)) continue
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
    }
    // 模板降级时登记的特殊字段，要等组件装载完才能补（见 `queueSpecialInfoFields`）
    await applyPendingSpecialFields()
    emit()
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

/**
 * 模板降级（v3 退役「时间 / 地点」组件）时，旧模板里的那两块不能凭空消失：
 * 值还在词条列里，但写作面上得有一个入口。于是把对应的**特殊字段**补进
 * 模板当时选中的基本信息组件（`time` / `timeEnd` / `place`）。
 *
 * 登记时组件可能还没装载（模板与组件是两条独立的读盘路径），所以先排队，
 * 组件装载完（`loadInfoGroups` 末尾）再统一补。补法是**纯增量**：
 * 已经有该类型就跳过，落盘一次；之后用户删掉也不会被加回来。
 */
const pendingSpecialFields = new Map<string, Set<InfoFieldType>>()

const SPECIAL_FIELD_DEFAULT_LABELS: Record<'time' | 'timeEnd' | 'place', string> = {
  time: '时间',
  timeEnd: '结束时间',
  place: '地点',
}

export function queueSpecialInfoFields(
  groupId: string,
  types: readonly ('time' | 'timeEnd' | 'place')[],
): void {
  const id = groupId.trim()
  if (id === '' || types.length === 0) return
  const bucket = pendingSpecialFields.get(id) ?? new Set<InfoFieldType>()
  for (const type of types) bucket.add(type)
  pendingSpecialFields.set(id, bucket)
  if (loaded) void applyPendingSpecialFields()
}

/** 一个还不存在的位置：特殊字段的键只是行身份，撞名时加序号（列才是它的归属） */
function freeFieldKey(taken: readonly string[], base: string): string {
  if (!taken.includes(base)) return base
  let index = 2
  while (taken.includes(`${base}-${index}`)) index += 1
  return `${base}-${index}`
}

async function applyPendingSpecialFields(): Promise<void> {
  if (pendingSpecialFields.size === 0 || !loaded) return
  const pending = new Map(pendingSpecialFields)
  pendingSpecialFields.clear()

  let changed = false
  const next = snapshot.map((group) => {
    const needs = pending.get(group.id)
    if (needs === undefined) return group
    const fields = [...group.fields]
    const types = { ...(group.types ?? {}) }
    const labels = { ...(group.labels ?? {}) }
    let touched = false
    for (const type of needs) {
      if (!isSpecialInfoFieldType(type)) continue
      if (Object.values(types).includes(type)) continue
      const key = freeFieldKey(fields, INFO_FIELD_COLUMNS[type as keyof typeof INFO_FIELD_COLUMNS])
      fields.push(key)
      types[key] = type
      labels[key] = SPECIAL_FIELD_DEFAULT_LABELS[type as keyof typeof SPECIAL_FIELD_DEFAULT_LABELS]
      touched = true
    }
    if (!touched) return group
    changed = true
    return { ...group, fields, types, labels }
  })

  if (!changed) return
  try {
    await saveInfoGroups(next)
  } catch {
    // 落盘失败不该让开库流程中断：内存里已经补上（`saveInfoGroups` 先改内存再写盘），
    // 下次任何一次保存会把它一起写出去
  }
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
  if (id.startsWith('country')) return 'country'
  // 词条是**笔记宿主**：没有全局字段表，字段来自按篇选的模板 / 组件（2026-11-09 收口）
  if (id.startsWith('entry') || id.startsWith('world')) return 'note'
  if (id.startsWith('pet') || id.startsWith('weapon')) return 'note'
  return undefined
}

/**
 * 某套模板能选的基本信息组件。
 *
 * - **列型宿主**（角色 / 事件）：字段表是全局唯一真源，模板只是引用它 ——
 *   所以只列同一宿主的那一份（自建组件的字段是自建键，混进来会渲染成空行）
 * - **笔记宿主**（词条 / 国家 / 宠物 / 武器 / 自建模板）：列笔记型组件 + 没标宿主的老组件
 */
export function selectableInfoGroups(templateId: string, groups: readonly InfoGroup[]): InfoGroup[] {
  const host = infoGroupHostOfTemplate(templateId)
  if (host === 'character' || host === 'event' || host === 'country') {
    return groups.filter((group) => group.for === host)
  }
  return groups.filter((group) => group.for === undefined || group.for === 'note')
}
