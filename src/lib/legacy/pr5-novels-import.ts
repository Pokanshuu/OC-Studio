/**
 * fork 版小说 → 我们的笔记树（W2 第二刀：导入接线）。
 *
 * 分工：
 * - `pr5-novels.ts` 只负责「读 + 映射」（纯函数，可单测）
 * - 这里负责「落库」：写 `worldEntries`、补 `parentId`、写操作日志
 *
 * 幂等按**内容**判断，不依赖任何标记：
 * 同标题 + `category: '小说'` 的根节点已存在就跳过整本，章节再按标题去重。
 * 这样即使换机器、或标记没落盘，也不会重复长出一棵树。
 */
import { db } from '@/lib/db'
import { logOperation, pendingStamp } from '@/lib/sync'
import { planNovelImport, readLegacyNovels, type LegacyNovel } from './pr5-novels'
import type { WorldEntry } from '@/types'

const TABLE = 'worldEntries'
/** 小说在库里是一个「归属标记」，层级仍然只由 parentId 表达（docs/小说.md §2） */
export const NOVEL_CATEGORY = '小说'

export interface LegacyNovelImportReport {
  /** 真正导入了多少本 */
  importedNovels: number
  importedChapters: number
  /** 已存在、整本跳过的 */
  skippedNovels: string[]
  /** 章节里被跳过（同标题已存在）的数量 */
  skippedChapters: number
  /** 封面拿不到的数量（blob / http） */
  skippedCovers: number
  /** HTML 降级处数（无 DOM 环境） */
  htmlFallbacks: number
}

function emptyReport(): LegacyNovelImportReport {
  return {
    importedNovels: 0,
    importedChapters: 0,
    skippedNovels: [],
    skippedChapters: 0,
    skippedCovers: 0,
    htmlFallbacks: 0,
  }
}

function buildRow(params: {
  title: string
  content: string
  parentId: number | null
  order: number
}): Omit<WorldEntry, 'id'> {
  const now = Date.now()
  return {
    title: params.title,
    content: params.content,
    // 历史字段：这里用它当「小说」的归属标记（读侧已支持，写侧不覆盖用户已有值）
    category: NOVEL_CATEGORY,
    parentId: params.parentId,
    order: params.order,
    isConcept: false,
    references: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
    deleted: false,
    ...pendingStamp(now),
  }
}

async function insertRow(row: Omit<WorldEntry, 'id'>): Promise<number> {
  const id = await db.worldEntries.add(row)
  await logOperation(TABLE, id, 'title', '', row.title)
  return id
}

/** 库里已经有哪些小说根节点（按标题） */
async function existingNovelRoots(): Promise<Set<string>> {
  const rows = await db.worldEntries
    .filter((entry) => !entry.deleted && entry.category === NOVEL_CATEGORY && entry.parentId === null)
    .toArray()
  return new Set(rows.map((row) => row.title))
}

async function importOne(novel: LegacyNovel, startOrder: number, report: LegacyNovelImportReport): Promise<number> {
  const plan = planNovelImport(novel, startOrder)
  const rootId = await insertRow(buildRow(plan.root))
  report.skippedCovers += plan.report.skippedCovers
  report.htmlFallbacks += plan.report.htmlFallbacks

  let chapters = 0
  for (const chapter of plan.chapters) {
    // plan 里章节的 parentId 是 null（拿主键前不知道），这里回填
    await insertRow(buildRow({ ...chapter, parentId: rootId }))
    chapters += 1
  }
  report.importedChapters += chapters
  return chapters + 1
}

/**
 * 把 fork 库里的小说一次性搬进来。
 *
 * - 没有旧库 → 返回空报告（不是错误）
 * - 已存在同名小说根节点 → 整本跳过（幂等）
 * - **只读** `OCStudioNovels`，不删、不清空
 */
export async function importLegacyNovels(): Promise<LegacyNovelImportReport> {
  const report = emptyReport()
  const novels = await readLegacyNovels()
  if (novels.length === 0) return report

  const taken = await existingNovelRoots()
  let order = (await db.worldEntries.count()) + 1

  for (const novel of novels) {
    const title = novel.title.trim() || '未命名小说'
    if (taken.has(title)) {
      report.skippedNovels.push(title)
      continue
    }
    const rows = await importOne(novel, order, report)
    order += rows
    taken.add(title)
    report.importedNovels += 1
  }

  return report
}
