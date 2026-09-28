import Dexie, { type Table } from 'dexie'

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
  characters!: Table<Character, number>
  events!: Table<Event, number>
  countries!: Table<Country, number>
  worldEntries!: Table<WorldEntry, number>
  tags!: Table<Tag, number>
  operationLog!: Table<OperationLog, number>
  periods!: Table<Period, number>
  meta!: Table<ProjectMeta, number>

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
