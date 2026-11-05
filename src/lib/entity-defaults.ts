/**
 * 「新建一条实体」时的默认值 —— **唯一源**。
 *
 * 这些字面量原先散在 `lib/use-entity-workspace.ts` 的四个 `handleCreateX` 里；
 * 树形表格的「新增」也要造同样的空行，抄第二份就会漂（改了一边另一边不知情）。
 *
 * 这里只给**数据**，不负责落库、不负责导航：谁新建，谁决定建完停在哪
 * （工作区会打开编辑器，树表留在表里）。
 */
import type { WorldFormData } from '@/features/world/types'
import type { CountryFormData } from '@/features/countries/types'
import type { CharacterFormData } from '@/features/characters/types'
import type { EventFormData } from '@/features/events/types'

/** 普通词条（进世界观目录树的根） */
export function newWorldEntryData(): WorldFormData {
  return { title: '新词条', content: '', parentId: null, order: 0, isConcept: false, tags: [] }
}

export function newCountryData(): CountryFormData {
  return {
    name: '新国家',
    parentId: null,
    description: '',
    system: '',
    geography: '',
    culture: '',
    tags: [],
  }
}

export function newCharacterData(): CharacterFormData {
  return {
    name: '新角色',
    aliases: [],
    race: '',
    element: '',
    occupation: '',
    faction: '',
    nationalityLegacy: '',
    height: '',
    birthday: '',
    avatarUrl: '',
    bio: '',
    lifeStory: '',
    relatedCharacters: [],
    gallery: [],
    avatars: [],
    tags: [],
  }
}

export function newEventData(): EventFormData {
  return {
    title: '新事件',
    time: '',
    location: '',
    summary: '',
    isMajor: false,
    content: '',
    tags: [],
  }
}
