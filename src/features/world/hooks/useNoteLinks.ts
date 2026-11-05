'use client'

/**
 * 词条之间的**层级 / 命名关系 / 引用** —— 前两者是存储，最后一个是查询。
 *
 * 「关系」组件在笔记宿主上显示四类事实：
 * - 父词条 / 子条目：`parentId` 的两头（层级只有这一份真源）
 * - 命名关系：`WorldEntry.relations` 里手写的边（与角色 / 事件同形，只存发起方）
 * - 引用 / 被引用：正文里 `[[链接]]` / `@` 的扫描（正文是唯一真源）
 *
 * 同一目标已有命名边时不再重复显示「引用」；反查侧同理，命名边优先。
 * 世界编辑器与分类条目编辑器共用同一次查询，别各扫一遍库。
 */
import { useEffect, useMemo, useState } from 'react'
import type { Character, WorldEntry } from '@/types'
import type { RelationArrow } from '@/lib/relation-colors'
import type { RelationTargetKind } from '@/components/shared/relations/types'
import { db } from '@/lib/db'
import { worldBodyOf } from '@/lib/world-body'
import { docHasRef, docRefs } from '@/features/world/components/world-content-utils'

export interface NoteLink {
  id: number
  title: string
}

/** 一条命名关系（出站是目标，入站是来源） */
export interface NoteRelationLink {
  /** 对方的实体类型：笔记自己的边是 world；角色的「相关笔记」是 character */
  kind: RelationTargetKind
  /** 对方 id；盘上只有名字、解析不到实体时为空 */
  id?: number
  name: string
  relation: string
  color?: string
  arrow?: RelationArrow
  /** 在来源 `relations` 数组里的位置（改 / 删按它定位） */
  index: number
}

export interface NoteLinks {
  parent: NoteLink | null
  children: NoteLink[]
  /** 本条目正文里引用到的条目（已排除有命名边的目标） */
  outbound: NoteLink[]
  /** 引用了当前条目的笔记（已排除有命名边的来源） */
  backlinks: NoteLink[]
  /** 本条目手写的命名关系 */
  manual: NoteRelationLink[]
  /** 别的笔记用命名关系指向本条目 */
  manualInbound: NoteRelationLink[]
  /** 本次查询读到的全部词条（解析名字 / 生成候选用） */
  all: WorldEntry[]
  loading: boolean
}

const EMPTY: NoteLinks = {
  parent: null,
  children: [],
  outbound: [],
  backlinks: [],
  manual: [],
  manualInbound: [],
  all: [],
  loading: false,
}

/** 纯函数：在已加载的词条里找出引用了 `entryId` 的那些（正文走 `worldBodyOf`） */
export function findBacklinks(rows: WorldEntry[], entryId: number): NoteLink[] {
  const key = String(entryId)
  const found: NoteLink[] = []
  for (const row of rows) {
    if (row.deleted || row.id === entryId) continue
    if (docHasRef(worldBodyOf(row), key)) found.push({ id: row.id, title: row.title })
  }
  return found
}

export function buildNoteLinks(
  rows: WorldEntry[],
  entryId: number,
  characters: Character[] = [],
): Omit<NoteLinks, 'loading'> {
  const all = rows.filter((row) => !row.deleted)
  const self = all.find((row) => row.id === entryId)
  const byId = new Map(all.map((row) => [row.id, row]))
  const parent =
    self?.parentId === undefined || self?.parentId === null
      ? null
      : (() => {
          const target = byId.get(self.parentId)
          return target ? { id: target.id, title: target.title } : null
        })()

  // 手写的命名关系：目标名取当前标题，目标被删时保留盘上的名字快照
  const manual: NoteRelationLink[] = (self?.relations ?? []).map((relation, index) => {
    const target =
      relation.targetId !== undefined ? byId.get(relation.targetId) : undefined
    return {
      kind: 'world',
      id: target?.id,
      name: target?.title ?? relation.name,
      relation: relation.relation,
      color: relation.color,
      arrow: relation.arrow,
      index,
    }
  })
  const manuallyLinked = new Set(
    manual.map((item) => item.id).filter((id): id is number => id !== undefined),
  )

  // 正文提及：同一目标已有命名边时不再重复成一行
  const outbound: NoteLink[] = []
  if (self) {
    for (const id of docRefs(worldBodyOf(self))) {
      const target = byId.get(Number(id))
      if (!target || target.id === entryId || manuallyLinked.has(target.id)) continue
      outbound.push({ id: target.id, title: target.title })
    }
  }

  // 别的笔记用命名关系指向我：只读反查，和正文反查合并时命名边优先
  const manualInbound: NoteRelationLink[] = []
  for (const row of all) {
    if (row.id === entryId) continue
    for (const [index, relation] of (row.relations ?? []).entries()) {
      if (relation.targetId !== entryId) continue
      manualInbound.push({
        kind: 'world',
        id: row.id,
        name: row.title,
        relation: relation.relation,
        color: relation.color,
        arrow: relation.arrow,
        index,
      })
    }
  }

  // 角色 → 笔记：角色自己的「相关笔记」在笔记侧显示为「来自该角色」
  for (const character of characters) {
    for (const [index, relation] of (character.relatedNotes ?? []).entries()) {
      if (relation.targetId !== entryId) continue
      manualInbound.push({
        kind: 'character',
        id: character.id,
        name: character.name,
        relation: relation.relation,
        color: relation.color,
        arrow: relation.arrow,
        index,
      })
    }
  }

  manualInbound.sort(
    (a, b) =>
      a.name.localeCompare(b.name, 'zh-Hans') ||
      a.relation.localeCompare(b.relation, 'zh-Hans'),
  )
  // 只拿「笔记来源」去和正文反查去重；角色 id 与笔记 id 可能撞号，不能混在一起
  const manuallySourced = new Set(
    manualInbound
      .filter((item) => item.kind === 'world')
      .map((item) => item.id)
      .filter((id): id is number => id !== undefined),
  )

  return {
    parent,
    children: all
      .filter((row) => row.parentId === entryId)
      .map((row) => ({ id: row.id, title: row.title })),
    outbound,
    backlinks: findBacklinks(all, entryId).filter((link) => !manuallySourced.has(link.id)),
    manual,
    manualInbound,
    all,
  }
}

/**
 * @param rows 已经加载好的词条（世界编辑器有列表，直接传进来；
 *             分类条目编辑器没有列表，省略即自己读一次库）
 * @param version 条目版本（如 `updatedAt`）：没有列表时，保存后用它触发重查
 */
export function useNoteLinks(entryId: number | null, rows?: WorldEntry[], version?: number): NoteLinks {
  const [links, setLinks] = useState<NoteLinks>(EMPTY)
  /** 角色侧也可能有指向这篇笔记的「相关笔记」 */
  const [characters, setCharacters] = useState<Character[]>([])

  useEffect(() => {
    if (entryId === null) return
    let cancelled = false
    void db.characters
      .filter((row) => !row.deleted)
      .toArray()
      .then((all) => {
        if (!cancelled) setCharacters(all)
      })
      .catch(() => {
        if (!cancelled) setCharacters([])
      })
    return () => {
      cancelled = true
    }
  }, [entryId])

  const fromRows = useMemo(
    () =>
      rows === undefined || entryId === null
        ? null
        : { ...buildNoteLinks(rows, entryId, characters), loading: false },
    [rows, entryId, characters],
  )

  useEffect(() => {
    // 调用方给了列表就跟着它走：不再自己扫库，也就不会在保存后拿到一份过期结果
    if (rows !== undefined || entryId === null) return
    let cancelled = false
    void db.worldEntries
      .filter((row) => !row.deleted)
      .toArray()
      .then((all) => {
        if (cancelled) return
        setLinks({ ...buildNoteLinks(all, entryId, characters), loading: false })
      })
      .catch(() => {
        if (!cancelled) setLinks({ ...EMPTY, loading: false })
      })
    return () => {
      cancelled = true
    }
  }, [entryId, rows, version, characters])

  if (entryId === null) return EMPTY
  return fromRows ?? links
}
