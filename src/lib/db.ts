import Dexie, { type Table } from 'dexie'

import type {
  Character,
  Event,
  Country,
  WorldEntry,
  Tag,
  OperationLog,
} from '@/types'

export class OCStudioDB extends Dexie {
  characters!: Table<Character, number>
  events!: Table<Event, number>
  countries!: Table<Country, number>
  worldEntries!: Table<WorldEntry, number>
  tags!: Table<Tag, number>
  operationLog!: Table<OperationLog, number>

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
  }
}

export const db = new OCStudioDB()
