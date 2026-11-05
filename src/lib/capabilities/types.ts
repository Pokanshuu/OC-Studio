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
  relations: CodexRelation[]
  events: CodexEvent[]
  tags: string[]
  /** 正文纯文本（v1 不跑 markdown 桥；落盘原文仍以 vault 为准） */
  body: string
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
