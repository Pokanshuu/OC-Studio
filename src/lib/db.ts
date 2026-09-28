import Dexie, { type EntityTable } from 'dexie'

import type {
  Character,
  Event,
  Country,
  WorldEntry,
  Tag,
  OperationLog,
  Period,
  ProjectMeta,
} from '@/types'

export class OCStudioDB extends Dexie {
  // EntityTable<T, 'id'>：读出来的行 id 必为 number，写入时 id 可省略（由 Dexie 生成）。
  // 这样「落库实体」与「新建草稿」两种状态在类型上分开，不再需要 `id` 之类的断言。
  characters!: EntityTable<Character, 'id'>
  events!: EntityTable<Event, 'id'>
  countries!: EntityTable<Country, 'id'>
  worldEntries!: EntityTable<WorldEntry, 'id'>
  tags!: EntityTable<Tag, 'id'>
  operationLog!: EntityTable<OperationLog, 'id'>
  periods!: EntityTable<Period, 'id'>
  meta!: EntityTable<ProjectMeta, 'id'>

  constructor() {
    super('OCStudioDB')

    this.version(3).stores({
      characters: '++id, name, race, element, occupation, nationalityLegacy, countryId, deleted, _syncStatus',
      events: '++id, title, time, parentEventId, isMajor, deleted, _syncStatus',
      countries: '++id, name, parentId, deleted, _syncStatus',
      worldEntries: '++id, title, category, parentId, deleted, _syncStatus',
      tags: '++id, name, category',
      operationLog: '++id, timestamp, targetType, targetId',
    })

    this.version(5).stores({
      characters: '++id, name, race, element, occupation, nationalityLegacy, countryId, deleted, _syncStatus',
      events: '++id, title, time, parentEventId, isMajor, deleted, _syncStatus',
      countries: '++id, name, parentId, deleted, _syncStatus',
      worldEntries: '++id, title, category, parentId, deleted, _syncStatus',
      tags: '++id, name, category',
      operationLog: '++id, timestamp, targetType, targetId',
      periods: '++id, startTime, deleted',
    })

    // v6：新增项目元信息表（单例）；characters 增加 isMajor 索引（主要角色）
    this.version(6).stores({
      characters: '++id, name, race, element, occupation, nationalityLegacy, countryId, isMajor, deleted, _syncStatus',
      events: '++id, title, time, parentEventId, isMajor, deleted, _syncStatus',
      countries: '++id, name, parentId, deleted, _syncStatus',
      worldEntries: '++id, title, category, parentId, deleted, _syncStatus',
      tags: '++id, name, category',
      operationLog: '++id, timestamp, targetType, targetId',
      periods: '++id, startTime, deleted',
      meta: 'id',
    })
  }
}

export const db = new OCStudioDB()
