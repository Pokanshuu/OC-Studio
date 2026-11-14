/**
 * 角色左栏的分组数据适配。
 *
 * 只负责把「角色 + 国家 / 文件夹清单」喂给 `lib/list-grouping` 的纯函数：
 * 分组不改 `countryId` / `folder`，也不创建 / 移动 / 删除任何实体或文件。
 *
 * 口径：
 * - 国家：**唯一入口** `resolveCharacterCountryId`（id 优先，旧「国籍」文本按名字回落）；
 *   指向已删国家的角色进「未归属」，一条都不能丢。
 * - 文件夹：只读 `Character.folder` 与既有清单；空白 / 缺省进「未分组」，
 *   清单漏记的名字照样成组（`unknownGroup`），空文件夹在非搜索状态下保留。
 */
import { resolveCharacterCountryId } from '@/lib/membership'
import {
  UNASSIGNED_COUNTRY_KEY,
  UNASSIGNED_COUNTRY_LABEL,
  UNASSIGNED_FOLDER_KEY,
  UNASSIGNED_FOLDER_LABEL,
  countryGroupKey,
  folderDefinitions,
  folderGroupDefinition,
  folderGroupKey,
  groupItems,
  type ListGroup,
} from '@/lib/list-grouping'
import type { Character, Country } from '@/types'

export function groupCharactersByCountry(
  characters: readonly Character[],
  countries: readonly Country[],
): ListGroup<Character>[] {
  const knownIds = new Set(countries.map((country) => country.id))
  return groupItems({
    items: characters,
    keyOf: (character) => {
      const id = resolveCharacterCountryId(character, countries)
      return id !== null && knownIds.has(id) ? countryGroupKey(id) : null
    },
    known: countries.map((country) => ({ key: countryGroupKey(country.id), label: country.name })),
    fallback: { key: UNASSIGNED_COUNTRY_KEY, label: UNASSIGNED_COUNTRY_LABEL },
  })
}

export interface CharacterFolderGroupInput {
  /** 参与分组（已搜索过滤）的角色，组内顺序原样保留 */
  items: readonly Character[]
  /** 文件夹清单 + 角色身上的名字（含空文件夹，来自 `listFolders`） */
  folderNames: readonly string[]
  /** 正在搜索：不显示零命中组（含空文件夹） */
  searching?: boolean
}

export function groupCharactersByFolder({
  items,
  folderNames,
  searching = false,
}: CharacterFolderGroupInput): ListGroup<Character>[] {
  return groupItems({
    items,
    keyOf: (character) => {
      const name = (character.folder ?? '').trim()
      return name === '' ? null : folderGroupKey(name)
    },
    known: folderDefinitions(folderNames, items),
    fallback: { key: UNASSIGNED_FOLDER_KEY, label: UNASSIGNED_FOLDER_LABEL },
    unknownGroup: folderGroupDefinition,
    keepEmpty: !searching,
  })
}
