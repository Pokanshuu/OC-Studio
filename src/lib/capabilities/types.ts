/**
 * 只读能力层（`docs/Agent接入.md` §1 / §2.3）。
 *
 * **权限画在入口**，不认调用方是谁：内置 agent / MCP / 插件都必须带同一个
 * `Caller { actor, permissions }` 进来。v1 只做只读，写能力等落盘链路接通后再开。
 *
 * 这里只有类型与入口；Dexie 适配器在 `dexie-store.ts`，测试用内存 store。
 */
import type { Character, Country, Event, Tag, WorldEntry } from '@/types'
import type { JournalActor } from '@/lib/vault/journal'

export type EntityKind = 'character' | 'event' | 'country' | 'world'

export type PermissionLevel = 0 | 1 | 2 | 3

export interface Caller {
  actor: JournalActor
  /** 0 只读 / 1 写正文 / 2 改结构 / 3 删除 */
  permissions: PermissionLevel
}

export interface EntitySummary {
  kind: EntityKind
  id: number
  title: string
  aliases: string[]
  tags: string[]
  updatedAt: number
  /** 搜索时命中在哪 —— 让模型知道「正文里有这个名字」，不是标题 */
  matchedIn?: 'title' | 'alias' | 'tag' | 'body'
}

/** `listEntities` 的筛选条件（都是可选的，给的是「与」关系） */
export interface EntityFilter {
  /** 仅 `world`：分类名（含「小说」「地图」） */
  category?: string
  /** 标签名（精确） */
  tag?: string
  /** 仅 `character`：只要主要角色 */
  isMajor?: boolean
}

export interface SearchOptions {
  /** 是否扫正文（默认扫）。关掉就只匹配标题 / 别名 / 标签 */
  body?: boolean
}

export interface CodexField {
  key: string
  value: string
}

export interface CodexRelation {
  relation: string
  targetKind?: EntityKind
  targetId?: number
  name: string
}

export interface CodexEvent {
  id: number
  title: string
  time: string
  endTime?: string
}

export interface CodexEntry {
  kind: EntityKind
  id: number
  title: string
  aliases: string[]
  fields: CodexField[]
  /** 自建字段的**原始键名** → 值（写回用键名，不给键名模型只能猜） */
  custom: Record<string, string>
  relations: CodexRelation[]
  events: CodexEvent[]
  tags: string[]
  /** 正文纯文本（v1 不跑 markdown 桥；落盘原文仍以 vault 为准） */
  body: string
  /**
   * 上级（国家 / 词条才有层级；事件没有）。
   * 单独给出而不是塞进 `fields`：层级是结构，不是可写标量 —— 模型要能**看见**它，
   * 但 `library_set_fields` 不该收它（国家的 `parentId` 由表格页维护）。
   */
  parent?: { id: number; title: string }
  /** 已设置的图片槽位：槽位名 → 库内路径（空的槽位不列） */
  media?: Record<string, string>
}

export interface EntityRecordMap {
  character: Character
  event: Event
  country: Country
  world: WorldEntry
}

/**
 * 能力层的数据来源。只暴露「列 / 取 / 标签」三件事：
 * 权限、装配、搜索都在能力层做，store 不参与判断。
 */
export interface CapabilityStore {
  list<K extends EntityKind>(kind: K): Promise<EntityRecordMap[K][]>
  get<K extends EntityKind>(kind: K, id: number): Promise<EntityRecordMap[K] | null>
  tags(): Promise<Tag[]>
}

export type CapabilityErrorCode = 'forbidden' | 'not-found' | 'invalid-caller'

export class CapabilityError extends Error {
  readonly code: CapabilityErrorCode

  constructor(code: CapabilityErrorCode, message: string) {
    super(message)
    this.name = 'CapabilityError'
    this.code = code
  }
}

export const READ_PERMISSION: PermissionLevel = 0
