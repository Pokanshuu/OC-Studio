import { plainTextOf } from '@/lib/export/site/render'
import { worldBodyOf } from '@/lib/world-body'
import type { Character, Country, Event, WorldEntry } from '@/types'

/**
 * 实体「正文」的纯文本 **唯一源**。
 *
 * 能力层（助手读库）与全局搜索（搜正文）都从这里取：两边对「什么算正文」
 * 必须是同一份判断，否则搜索命中一段话、助手却读不到，就会变成两个口径。
 *
 * 规则与编辑器一致：
 * - 正文正字段是 `document`（Tiptap），词条走 `lib/world-body.ts` 的老数据兜底
 * - `document` 为空 / 没有时，回落到各实体自己的纯文本字段（老库形态）
 */

export type EntityTextKind = 'character' | 'event' | 'country' | 'world'

/** 读正文纯文本；没有正文返回空串（调用方不需要区分 undefined / 空白） */
export function entityBodyText(
  kind: EntityTextKind,
  entity: Character | Event | Country | WorldEntry,
): string {
  if (kind === 'world') {
    return plainTextOf(worldBodyOf(entity as WorldEntry)).trim()
  }
  if (kind === 'event') {
    const event = entity as Event
    const fallback = [event.summary, event.content]
      .filter(Boolean)
      .map((value) => plainTextOf(value))
      .join('\n\n')
    return (plainTextOf(event.document) || fallback).trim()
  }
  if (kind === 'country') {
    const country = entity as Country
    const fallback = [country.description, country.system, country.geography, country.culture]
      .filter(Boolean)
      .map((value) => plainTextOf(value))
      .join('\n\n')
    return (plainTextOf(country.document) || fallback).trim()
  }
  const character = entity as Character
  const fallback = [character.bio, character.lifeStory]
    .filter(Boolean)
    .map((value) => plainTextOf(value))
    .join('\n\n')
  return (plainTextOf(character.document) || fallback).trim()
}
