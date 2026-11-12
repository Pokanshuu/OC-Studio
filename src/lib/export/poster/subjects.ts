/**
 * 海报导出的**数据装配**：把库里的实体 / 笔记整理成 `PosterData`。
 *
 * 只读、纯转换，不碰 UI。导出中心只调这两个函数：
 * - `listPosterSubjects()` 取得可导出的对象（角色 / 事件 / 国家 / 词条）
 * - `loadPosterSubject(kind, id)` 取得一张海报需要的全部内容
 *
 * 字段顺序沿用 `lib/fields/defaults.ts` 的内置字段目录；自定义字段跟在后面。
 * 正文优先读 `document`（Tiptap JSON），旧数据回落到纯文本列。
 */
import { worldBodyOf } from '@/lib/world-body'
import { db } from '@/lib/db'
import type { Character, Country, Event, WorldEntry } from '@/types'
import { plainTextOf } from '@/lib/export/site/render'
import { findTemplateByName, getTemplates, loadTemplates } from '@/lib/templates/store'
import { getCategories, loadCategories } from '@/lib/categories/store'
import type { PosterData, PosterField, PosterRelation } from './types'
import { isCodexEntry } from '@/lib/entry-kinds'

export type PosterSubjectKind = 'character' | 'event' | 'country' | 'world'

export const POSTER_SUBJECT_KINDS: PosterSubjectKind[] = ['character', 'event', 'country', 'world']

export const POSTER_SUBJECT_LABELS: Record<PosterSubjectKind, string> = {
  character: '角色',
  event: '事件',
  country: '国家',
  world: '词条',
}

export interface PosterSubject {
  kind: PosterSubjectKind
  id: number
  title: string
  /** 列表右侧的小字（种族 / 时间 / 体制 / 分类） */
  subtitle: string
  thumb?: string
  updatedAt: number
}

export interface PosterSubjectBundle {
  subject: PosterSubject
  data: PosterData
}

function text(value: unknown): string {
  return plainTextOf(value).replace(/\s+/g, ' ').trim()
}

function bodyText(document: unknown, fallback: string): string {
  const fromDoc = plainTextOf(document).trim()
  // 旧数据的 lifeStory / content 是 HTML 字符串，回落到它时也要过一遍纯文本
  return fromDoc !== '' ? fromDoc : plainTextOf(fallback).trim()
}

/**
 * 字段值一律过一遍纯文本。
 *
 * 老库的 `体制` / `地理` / `文化` / `制度` / `职业` 这些字段存的是**富文本 HTML**
 * （`<p>…</p>`），海报是成品图，不能把标签当字印上去；自定义字段同理。
 */
function pushField(target: PosterField[], label: string, value: string | undefined | null): void {
  const trimmed = text(value)
  if (trimmed !== '') target.push({ label, value: trimmed })
}

function pushCustom(target: PosterField[], custom: Record<string, string> | undefined): void {
  if (!custom) return
  for (const [label, value] of Object.entries(custom)) {
    const trimmed = text(value)
    if (trimmed !== '') target.push({ label, value: trimmed })
  }
}

async function tagNames(ids: number[] | undefined): Promise<string[]> {
  if (!ids || ids.length === 0) return []
  const rows = await db.tags.bulkGet(ids)
  return rows.map((tag) => tag?.name.trim() ?? '').filter((name) => name !== '')
}

/** 笔记的模板名：单篇覆盖 → 分类绑定 → 内置词条模板。 */
function templateNameOf(entry: WorldEntry): string {
  const direct = (entry.template ?? '').trim()
  if (direct !== '') {
    return findTemplateByName(direct)?.name ?? direct
  }
  const category = getCategories().find((item) => item.name === entry.category || item.id === entry.category)
  if (category) {
    return findTemplateByName(category.template)?.name ?? category.template
  }
  return '词条'
}

function kindLabelOf(entry: WorldEntry): string {
  const category = getCategories().find((item) => item.name === entry.category || item.id === entry.category)
  return category?.name ?? (entry.category.trim() !== '' ? entry.category : '词条')
}

function countryNameOf(countries: Country[], id: number | undefined): string {
  if (id === undefined) return ''
  return countries.find((country) => country.id === id)?.name ?? ''
}

function uniqueImages(values: (string | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const url = (value ?? '').trim()
    if (url === '' || seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

function characterData(character: Character, countries: Country[]): PosterData {
  const fields: PosterField[] = []
  pushField(fields, '种族', character.race)
  pushField(fields, '元素', character.element)
  pushField(fields, '职业', character.occupation)
  pushField(fields, '阵营', character.faction)
  pushField(fields, '国籍', countryNameOf(countries, character.countryId))
  pushField(fields, '身高', character.height)
  pushField(fields, '生日', character.birthday)
  pushCustom(fields, character.custom)

  const gallery = uniqueImages([
    ...character.gallery.map((image) => image.url),
    ...character.avatars.map((image) => image.url),
  ])
  const cover = uniqueImages([character.headerUrl, character.avatarUrl, ...gallery])[0]

  const relations: PosterRelation[] = character.relatedCharacters
    .filter((relation) => relation.name.trim() !== '')
    .map((relation) => ({ label: relation.name.trim(), value: relation.relation.trim() }))

  return {
    title: character.name.trim() || '未命名',
    subtitle: [character.race, character.occupation].filter((value) => (value ?? '').trim() !== '').join(' · '),
    kindLabel: POSTER_SUBJECT_LABELS.character,
    templateName: findTemplateByName('角色')?.name ?? '角色',
    cover,
    aliases: character.aliases,
    fields,
    tags: [],
    summary: text(character.bio),
    body: bodyText(character.document, character.lifeStory),
    relations,
    gallery,
    time: '',
    location: '',
  }
}

function eventData(event: Event, characters: Character[], countries: Country[]): PosterData {
  const people = (event.characters ?? [])
    .map((id) => characters.find((person) => person.id === id)?.name ?? '')
    .filter((name) => name !== '')
  const lands = (event.countries ?? [])
    .map((id) => countryNameOf(countries, id))
    .filter((name) => name !== '')

  const fields: PosterField[] = []
  pushField(fields, '参与角色', people.join('、'))
  pushField(fields, '相关国家', lands.join('、'))
  pushCustom(fields, event.custom)

  const gallery = uniqueImages(event.images.map((image) => image.url))
  const cover = uniqueImages([event.headerUrl, ...gallery])[0]

  return {
    title: event.title.trim() || '未命名',
    subtitle: event.isMajor ? '重大事件' : '',
    kindLabel: POSTER_SUBJECT_LABELS.event,
    templateName: findTemplateByName('事件')?.name ?? '事件',
    cover,
    aliases: event.aliases ?? [],
    fields,
    tags: [],
    summary: text(event.summary),
    body: bodyText(event.document, event.content),
    relations: [],
    gallery,
    time: [event.time, event.endTime].filter((value) => (value ?? '').trim() !== '').join(' ~ '),
    location: event.location.trim(),
  }
}

function countryData(country: Country, characters: Character[], countries: Country[]): PosterData {
  const parent = country.parentId === null ? undefined : countries.find((item) => item.id === country.parentId)
  const fields: PosterField[] = []
  pushField(fields, '体制', country.system)
  pushField(fields, '地理', country.geography)
  pushField(fields, '文化', country.culture)
  pushField(fields, '上级', parent?.name)
  pushCustom(fields, country.custom)

  const residents = characters
    .filter((person) => person.countryId === country.id)
    .slice(0, 8)
    .map<PosterRelation>((person) => ({ label: person.name, value: '居民' }))

  return {
    title: country.name.trim() || '未命名',
    subtitle: text(country.system),
    kindLabel: POSTER_SUBJECT_LABELS.country,
    templateName: findTemplateByName('国家')?.name ?? '国家',
    cover: uniqueImages([country.headerUrl, country.flagUrl])[0],
    aliases: country.aliases ?? [],
    fields,
    tags: [],
    summary: text(country.description),
    body: bodyText(country.document, ''),
    relations: residents,
    gallery: [],
    time: '',
    location: '',
  }
}

function worldData(
  entry: WorldEntry,
  entries: WorldEntry[],
  characters: Character[],
  events: Event[],
  countries: Country[],
): PosterData {
  const parent = entry.parentId === null ? undefined : entries.find((item) => item.id === entry.parentId)
  const fields: PosterField[] = []
  pushField(fields, '上级', parent?.title)
  pushCustom(fields, entry.custom)

  const manualRelations: PosterRelation[] = (entry.relations ?? [])
    .map((relation) => {
      const target =
        relation.targetId !== undefined
          ? entries.find((item) => item.id === relation.targetId)
          : undefined
      if (!target) return null
      return { label: target.title, value: relation.relation || '关系' }
    })
    .filter((item): item is PosterRelation => item !== null)

  const references: PosterRelation[] = (entry.references ?? [])
    .map((reference) => {
      const target =
        reference.targetType === 'character'
          ? characters.find((item) => item.id === reference.targetId)
          : reference.targetType === 'event'
            ? events.find((item) => item.id === reference.targetId)
            : reference.targetType === 'country'
              ? countries.find((item) => item.id === reference.targetId)
              : entries.find((item) => item.id === reference.targetId)
      if (!target) return null
      const label = 'name' in target ? target.name : target.title
      return { label, value: '引用' }
    })
    .filter((item): item is PosterRelation => item !== null)

  return {
    title: entry.title.trim() || '未命名',
    subtitle: kindLabelOf(entry),
    kindLabel: kindLabelOf(entry),
    templateName: templateNameOf(entry),
    cover: entry.cover,
    aliases: entry.aliases ?? [],
    fields,
    tags: [],
    summary: text(entry.summary ?? ''),
    body: bodyText(worldBodyOf(entry), ''),
    relations: [...manualRelations, ...references],
    // 2026-11-06：笔记也有模板组件的图片 / 时间 / 地点槽位了，海报按同一份数据出
    gallery: uniqueImages([entry.image, ...(entry.gallery ?? []).map((image) => image.url)]),
    time: [entry.time, entry.endTime]
      .filter((value) => (value ?? '').trim() !== '')
      .join(' ~ '),
    location: (entry.location ?? '').trim(),
  }
}

async function collectData(): Promise<{
  characters: Character[]
  events: Event[]
  countries: Country[]
  entries: WorldEntry[]
}> {
  const [characters, events, countries, entries] = await Promise.all([
    db.characters.filter((row) => !row.deleted).toArray(),
    db.events.filter((row) => !row.deleted).toArray(),
    db.countries.filter((row) => !row.deleted).toArray(),
    // 小说章节与地图不是「词条」：章节属于小说导出，地图只有底图。
    // 不过滤的话海报对象列表里会出现「第一章」「世界地图」，导出来是一张空卡。
    db.worldEntries.filter((row) => !row.deleted && isCodexEntry(row)).toArray(),
  ])
  return { characters, events, countries, entries }
}

/** 可选对象列表（按最近编辑排序），四种实体各一组。 */
export async function listPosterSubjects(): Promise<Record<PosterSubjectKind, PosterSubject[]>> {
  await Promise.all([loadTemplates(), loadCategories()])
  const { characters, events, countries, entries } = await collectData()

  const toSubjects = <T extends { id: number; updatedAt: number }>(
    rows: T[],
    map: (row: T) => Omit<PosterSubject, 'updatedAt'>,
  ): PosterSubject[] =>
    [...rows]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((row) => ({ ...map(row), updatedAt: row.updatedAt }))

  return {
    character: toSubjects(characters, (character) => ({
      kind: 'character',
      id: character.id,
      title: character.name.trim() || '未命名',
      subtitle: [character.race, countryNameOf(countries, character.countryId)].filter(Boolean).join(' · '),
      thumb: uniqueImages([character.avatarUrl, character.headerUrl])[0],
    })),
    event: toSubjects(events, (event) => ({
      kind: 'event',
      id: event.id,
      title: event.title.trim() || '未命名',
      subtitle: [text(event.time), text(event.location)].filter((value) => (value ?? '').trim() !== '').join(' · '),
      thumb: uniqueImages([event.headerUrl, ...event.images.map((image) => image.url)])[0],
    })),
    country: toSubjects(countries, (country) => ({
      kind: 'country',
      id: country.id,
      title: country.name.trim() || '未命名',
      subtitle: text(country.system),
      thumb: uniqueImages([country.flagUrl, country.headerUrl])[0],
    })),
    world: toSubjects(entries, (entry) => ({
      kind: 'world',
      id: entry.id,
      title: entry.title.trim() || '未命名',
      subtitle: kindLabelOf(entry),
      thumb: entry.cover,
    })),
  }
}

/** 取一张海报的完整数据；对象不存在返回 null。 */
export async function loadPosterSubject(kind: PosterSubjectKind, id: number): Promise<PosterSubjectBundle | null> {
  await Promise.all([loadTemplates(), loadCategories()])
  const data = await collectData()

  const withTags = async (poster: PosterData, ids: number[] | undefined, subject: PosterSubject): Promise<PosterSubjectBundle> => ({
    subject,
    data: {
      ...poster,
      serial: `NO. ${String(id).padStart(3, '0')}`,
      tags: await tagNames(ids),
    },
  })

  if (kind === 'character') {
    const character = data.characters.find((row) => row.id === id)
    if (!character) return null
    return withTags(characterData(character, data.countries), character.tags, {
      kind,
      id,
      title: character.name,
      subtitle: text(character.race),
      thumb: character.avatarUrl,
      updatedAt: character.updatedAt,
    })
  }

  if (kind === 'event') {
    const event = data.events.find((row) => row.id === id)
    if (!event) return null
    return withTags(eventData(event, data.characters, data.countries), event.tags, {
      kind,
      id,
      title: event.title,
      subtitle: text(event.time),
      thumb: event.headerUrl,
      updatedAt: event.updatedAt,
    })
  }

  if (kind === 'country') {
    const country = data.countries.find((row) => row.id === id)
    if (!country) return null
    return withTags(countryData(country, data.characters, data.countries), country.tags, {
      kind,
      id,
      title: country.name,
      subtitle: text(country.system),
      thumb: country.flagUrl,
      updatedAt: country.updatedAt,
    })
  }

  const entry = data.entries.find((row) => row.id === id)
  if (!entry) return null
  return withTags(worldData(entry, data.entries, data.characters, data.events, data.countries), entry.tags, {
    kind,
    id,
    title: entry.title,
    subtitle: kindLabelOf(entry),
    thumb: entry.cover,
    updatedAt: entry.updatedAt,
  })
}

/** 模板列表（给导出中心显示「这篇笔记用哪个模板」） */
export function posterTemplates(): { id: string; name: string }[] {
  return getTemplates().map((template) => ({ id: template.id, name: template.name }))
}
