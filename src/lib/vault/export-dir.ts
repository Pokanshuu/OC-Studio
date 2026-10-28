import { appDataDir } from '@tauri-apps/api/path'
import { exists } from '@tauri-apps/plugin-fs'

import { db } from '@/lib/db'
import { FIELDS_REL_PATH, getFieldConfig, serializeFieldConfig } from '@/lib/fields/store'
import type { Character, Country, Event, Period, ProjectMeta, Tag, WorldEntry } from '@/types'

import { setBody, setFrontmatterKeys, parseFrontmatter } from './frontmatter'
import { createLinkSerializer, documentOfEntity, serializeBody } from './markdown-bridge'
import { serializeEntity, type SerializeContext } from './serialize'
import { TAG_META_REL_PATH } from './vault-session'
import { DEFAULT_ASSETS_DIR, allocateRelPath, normalizeRelPath, pickPreferredFolder, sanitizeFileName, trashRelPath } from './vault-paths'
import { allocateAssetPath, planImageRewrites } from './vault-assets'
import { serializeTagMeta, tagMetaFromTags } from './vault-tags'
import { MARKER_REL_PATH, buildMarkerContent } from './vault-marker'
import { vaultFs } from './vault-fs'
import type { MergeStrategy } from '@/lib/import'
import type { VaultEntityKind, VaultStorableKind } from './types'

// ── 老数据 → 文件夹（全量物化） ──────────────────────────────────────────
// 把 Dexie 里的东西一次性生成成一份完整的文件夹内容，直接落盘，然后按
// 「打开文件夹」重新载入。
//
// 为什么不走「导出 .ocbak → 导入 Dexie → 靠落盘队列」：
//   1. 笔记库的 id 是**位置 id**（扫描顺序），备份里的自增 id 与它对不上 ——
//      两边一撞，内容会写进别人的文件；
//   2. 完整备份把图片内联成 data URI，靠队列写回去只会把 base64 塞进 frontmatter；
//   3. 字段表（`.ocstudio/fields.json`）不在备份里，自定义字段值会丢。
// 全量物化绕开了这三件事：没有 id 参与、图片重新落地成文件、字段表一并写出。
//
// **目标文件夹可以是空的，也可以已有笔记**（`strategy`）：
//   skip      同名笔记原样不动，只补新条目
//   overwrite 同名笔记就地更新（外科式改写，保留文件里我们不认识的键）
//   keep-both 撞名就另起一个 `名字 (2).md`（默认）
//   replace   先把已有笔记挪进 `.ocstudio/trash/`，再整套写入
// 「不删文件」的底线始终成立：replace 也只是移动，不是删除。

export interface ExportDirReport {
  /** 落下的笔记数 */
  notes: number
  /** 落下的图片数 */
  images: number
  /** 引用了但找不回来的图片（应用数据目录里没有、或 data URI 解析失败） */
  missingImages: string[]
  failedImages: { path: string; message: string }[]
  /** 回收站条目：写进 `.ocstudio/trash/`（不在应用里显示，但字节不丢） */
  trashed: number
  /** 落下的时期数 */
  periods: number
  /** 新建的笔记数 */
  created: number
  /** 就地更新的同名笔记数（overwrite） */
  overwritten: number
  /** 因为同名而跳过的条数（skip） */
  skippedExisting: number
  /** replace 时挪进回收站的旧笔记数 */
  movedToTrash: number
  /** replace 时挪不动的旧笔记（报告用） */
  moveErrors: string[]
}

export interface ExportDirOptions {
  /** 目标文件夹已有笔记时的处理方式；默认 keep-both */
  strategy?: MergeStrategy
}

export interface LegacyRows {
  characters: Character[]
  countries: Country[]
  events: Event[]
  worldEntries: WorldEntry[]
  tags: Tag[]
  periods: Period[]
  meta: ProjectMeta | null
}

/** 各表 → 序列化类型（顺序即落盘顺序：国家先写，角色挑目录时才有国家名可用） */
const KINDS: VaultStorableKind[] = ['country', 'character', 'event', 'worldEntry', 'period']

function rowsOfKind(rows: LegacyRows, kind: VaultStorableKind): { id: number }[] {
  switch (kind) {
    case 'country':
      return rows.countries
    case 'character':
      return rows.characters
    case 'event':
      return rows.events
    case 'worldEntry':
      return rows.worldEntries
    case 'tag':
      return rows.tags
    case 'period':
      return rows.periods
  }
}

function titleOf(kind: VaultStorableKind, row: { name?: string; title?: string }): string {
  const title = kind === 'character' || kind === 'country' || kind === 'tag' || kind === 'period'
    ? row.name
    : row.title
  return (title ?? '').trim()
}

/** 引用解析上下文：写盘时要把 id 换回名字（磁盘上没有 id） */
export function buildContext(rows: LegacyRows): SerializeContext {
  const nameOf = (kind: VaultEntityKind, id: number): string | undefined => {
    switch (kind) {
      case 'character':
        return rows.characters.find((item) => item.id === id)?.name
      case 'country':
        return rows.countries.find((item) => item.id === id)?.name
      case 'event':
        return rows.events.find((item) => item.id === id)?.title
      case 'worldEntry':
        return rows.worldEntries.find((item) => item.id === id)?.title
      case 'tag':
        return rows.tags.find((item) => item.id === id)?.name
      case 'period':
        return rows.periods.find((item) => item.id === id)?.name
      default:
        return undefined
    }
  }
  return {
    nameOf,
    tagName: (id) => rows.tags.find((item) => item.id === id)?.name,
  }
}

/** 文件所在目录（根目录返回空串） */
function folderOf(relPath: string): string {
  const slash = relPath.lastIndexOf('/')
  return slash >= 0 ? relPath.slice(0, slash) : ''
}

/**
 * 一个实体 → 一份 .md 原文。
 * 传 `base` 表示**覆盖已有文件**：以原文件为底稿，只改我们拥有的那几个键与正文，
 * 用户自己加的键、注释、键顺序都原样留着（与落盘队列同一套外科式语义）。
 */
export function composeNote(
  kind: VaultStorableKind,
  row: unknown,
  ctx: SerializeContext,
  base?: string,
): string {
  const snapshot =
    base === undefined
      ? { entity: null, frontmatter: {} }
      : { entity: null, frontmatter: parseFrontmatter(base).data }
  const updates = serializeEntity(kind, row, null, snapshot, ctx)
  const head = setFrontmatterKeys(base ?? '', updates)
  const body = serializeBody(kind, row, createLinkSerializer(ctx.nameOf))
  const text = body === null ? head : setBody(head, body.markdown)
  // setBody 会吃掉定性行后的空行，这里补一个文件末尾换行（编辑器与 git 都指望它）
  return text.endsWith('\n') ? text : `${text}\n`
}

// ── 图片 ────────────────────────────────────────────────────────────────

interface ImageRef {
  /** 实体里存的原始引用 */
  raw: string
  /** 直接落字节（data URI）或从磁盘复制（路径） */
  bytes?: number[]
  source?: string
  /** 目标文件名（撞名时由 allocateAssetPath 加后缀） */
  fileName: string
}

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
}

function base64ToBytes(base64: string): number[] {
  const binary = atob(base64)
  const bytes: number[] = new Array<number>(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** `data:image/png;base64,xxx` → 字节 + 扩展名；不是图片就返回 null */
function parseDataUri(raw: string): { bytes: number[]; ext: string } | null {
  const comma = raw.indexOf(',')
  if (comma < 0) return null
  const header = raw.slice(5, comma)
  const payload = raw.slice(comma + 1)
  const mime = header.split(';')[0]?.trim().toLowerCase() ?? ''
  const ext = MIME_EXT[mime]
  if (ext === undefined) return null
  try {
    if (header.includes(';base64')) return { bytes: base64ToBytes(payload), ext }
    // 非 base64 的 data URI（内联 svg 常见）按 URL 编码文本处理
    const text = decodeURIComponent(payload)
    return { bytes: [...new TextEncoder().encode(text)], ext }
  } catch {
    return null
  }
}

function fileNameOf(path: string): string {
  const clean = path.split('?')[0] ?? path
  const slash = clean.lastIndexOf('/')
  const name = slash >= 0 ? clean.slice(slash + 1) : clean
  return name === '' ? '图片' : name
}

/** 该实体是否算「本地文件 / data URI」图片引用（http、blob、已有相对素材一律不碰） */
function isLocalImageRef(value: string): boolean {
  if (value.startsWith('data:') || value.startsWith('images/')) return true
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')
}

/** 正文（Tiptap 文档）里的 imageBlock.src 也一并收集 —— 只搬字段不搬正文，图还是会丢 */
function collectBodyRefs(rows: LegacyRows, push: (value: string) => void): void {
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }
    const record = node as Record<string, unknown>
    if (record.type === 'imageBlock') {
      const attrs = record.attrs
      if (attrs !== null && typeof attrs === 'object') {
        const src = (attrs as Record<string, unknown>).src
        if (typeof src === 'string' && src !== '') push(src)
      }
    }
    for (const value of Object.values(record)) visit(value)
  }

  const docs: { kind: VaultStorableKind; row: unknown }[] = [
    ...rows.characters.map((row) => ({ kind: 'character' as const, row })),
    ...rows.countries.map((row) => ({ kind: 'country' as const, row })),
    ...rows.events.map((row) => ({ kind: 'event' as const, row })),
    ...rows.worldEntries.map((row) => ({ kind: 'worldEntry' as const, row })),
  ]
  for (const item of docs) visit(documentOfEntity(item.kind, item.row))
}

/** 收集所有实体里指向「本地文件 / data URI」的图片引用（字段 + 正文） */
function collectRefs(rows: LegacyRows): string[] {
  const found = new Set<string>()
  const push = (value: string | undefined): void => {
    if (typeof value !== 'string' || value === '') return
    if (isLocalImageRef(value)) found.add(value)
  }

  for (const character of rows.characters) {
    push(character.avatarUrl)
    push(character.headerUrl)
    for (const item of character.gallery ?? []) push(item?.url)
    for (const item of character.avatars ?? []) push(item?.url)
  }
  for (const country of rows.countries) {
    push(country.flagUrl)
    push(country.headerUrl)
  }
  for (const event of rows.events) {
    push(event.headerUrl)
    for (const item of event.images ?? []) push(item?.url)
  }
  if (rows.meta !== null) push(rows.meta.coverUrl)

  collectBodyRefs(rows, push)

  return [...found]
}

/** 把图片引用变成目标文件夹里的素材文件，并返回 旧引用 → 新相对路径 */
async function materializeImages(
  root: string,
  rows: LegacyRows,
  occupied: Set<string>,
  report: ExportDirReport,
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const refs = collectRefs(rows)
  if (refs.length === 0) return map

  const assetsDir = normalizeRelPath(DEFAULT_ASSETS_DIR)
  const appData = (await appDataDir()).replace(/\\/g, '/').replace(/\/+$/, '')

  const plans: ImageRef[] = []
  for (const raw of refs) {
    if (raw.startsWith('data:')) {
      const parsed = parseDataUri(raw)
      if (parsed === null) {
        report.missingImages.push('data URI（无法识别的格式）')
        continue
      }
      plans.push({ raw, bytes: parsed.bytes, fileName: `图片.${parsed.ext}` })
      continue
    }

    const source = raw.startsWith('images/') ? `${appData}/${raw.slice('images/'.length)}` : raw
    try {
      if (!(await exists(source))) {
        report.missingImages.push(raw)
        continue
      }
    } catch {
      report.missingImages.push(raw)
      continue
    }
    plans.push({ raw, source, fileName: fileNameOf(raw) })
  }

  for (const plan of plans) {
    try {
      const target = allocateAssetPath(assetsDir, plan.fileName, occupied)
      if (plan.bytes !== undefined) {
        await vaultFs.writeBytes(root, target, plan.bytes)
      } else if (plan.source !== undefined) {
        await vaultFs.importFile(root, plan.source, target)
      } else {
        continue
      }
      occupied.add(target)
      map.set(plan.raw, target)
      report.images += 1
    } catch (err) {
      report.failedImages.push({
        path: plan.raw.startsWith('data:') ? 'data URI' : plan.raw,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return map
}

/** 把成功的图片映射写回实体（就地改，随后序列化读到的就是新路径） */
function applyImageMap(rows: LegacyRows, map: Map<string, string>): void {
  if (map.size === 0) return
  const patches = planImageRewrites(
    {
      characters: rows.characters,
      countries: rows.countries,
      events: rows.events,
      meta: rows.meta === null ? [] : [rows.meta],
    },
    map,
  )
  const index = new Map<string, { id: number }>([
    ...rows.characters.map((row) => [`characters:${row.id}`, row] as const),
    ...rows.countries.map((row) => [`countries:${row.id}`, row] as const),
    ...rows.events.map((row) => [`events:${row.id}`, row] as const),
    ...(rows.meta === null ? [] : [[`meta:${rows.meta.id}`, rows.meta] as const]),
  ])
  for (const patch of patches) {
    const row = index.get(`${patch.table}:${patch.id}`)
    if (row !== undefined) Object.assign(row, patch.patch)
  }

  rewriteBodyImages(rows, map)
}

/** 正文里 imageBlock 的 src 换成新路径（词条的正文在 `content` 里，也要回写） */
function rewriteBodyImages(rows: LegacyRows, map: Map<string, string>): void {
  const swap = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map((item) => swap(item))
    if (node === null || typeof node !== 'object') return node
    const record = node as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(record)) out[key] = swap(value)
    if (record.type === 'imageBlock' && out.attrs !== null && typeof out.attrs === 'object') {
      const attrs = { ...(out.attrs as Record<string, unknown>) }
      const src = attrs.src
      if (typeof src === 'string') {
        const next = map.get(src)
        if (next !== undefined) attrs.src = next
      }
      out.attrs = attrs
    }
    return out
  }

  const apply = (kind: VaultStorableKind, row: unknown): void => {
    const doc = documentOfEntity(kind, row)
    if (doc === null) return
    const next = swap(doc)
    if (kind === 'worldEntry') {
      // 词条的正文存在 content（JSON 字符串）里，document 只是派生
      ;(row as { content?: string }).content = JSON.stringify(next)
      ;(row as { document?: unknown }).document = next
      return
    }
    ;(row as { document?: unknown }).document = next
  }

  for (const row of rows.characters) apply('character', row)
  for (const row of rows.countries) apply('country', row)
  for (const row of rows.events) apply('event', row)
  for (const row of rows.worldEntries) apply('worldEntry', row)
}

// ── 主流程 ──────────────────────────────────────────────────────────────

async function readLegacyRows(): Promise<LegacyRows> {
  const [characters, countries, events, worldEntries, tags, periods, metaRow] = await Promise.all([
    db.characters.toArray(),
    db.countries.toArray(),
    db.events.toArray(),
    db.worldEntries.toArray(),
    db.tags.toArray(),
    db.periods.toArray(),
    db.meta.get(1),
  ])
  return {
    characters,
    countries,
    events,
    worldEntries,
    tags,
    periods,
    meta: metaRow ?? null,
  }
}

function folderNameOf(root: string): string {
  const clean = root.replace(/\\/g, '/').replace(/\/+$/, '')
  const slash = clean.lastIndexOf('/')
  return slash >= 0 ? clean.slice(slash + 1) : clean
}

/**
 * 把应用内的老数据全量物化到目标文件夹。
 *
 * 目标文件夹**可以已有笔记**：`strategy` 决定同名笔记怎么处理（见文件头）。
 * 底线不变：这里从不删除文件，最狠的 replace 也只是把旧笔记挪进 `.ocstudio/trash/`。
 */
export async function exportLegacyToFolder(
  root: string,
  options?: ExportDirOptions,
): Promise<ExportDirReport> {
  const strategy: MergeStrategy = options?.strategy ?? 'keep-both'
  const report: ExportDirReport = {
    notes: 0,
    images: 0,
    missingImages: [],
    failedImages: [],
    trashed: 0,
    periods: 0,
    created: 0,
    overwritten: 0,
    skippedExisting: 0,
    movedToTrash: 0,
    moveErrors: [],
  }

  const all = await readLegacyRows()

  // 回收站条目也要留字节：它们写进 `.ocstudio/trash/`（扫描层跳过这个目录，
  // 所以不会在应用里复活成正常条目，但文件还在，需要时能翻出来）。
  // 时期现在是正常词条的一种（`时期/xxx.md`），跟着一起写。
  const trashedRows: { kind: VaultStorableKind; row: unknown; title: string }[] = []

  const split = <T extends { deleted?: boolean }>(rows: T[], kind: VaultStorableKind, title: (row: T) => string): T[] => {
    const out: T[] = []
    for (const row of rows) {
      if (row.deleted === true) {
        trashedRows.push({ kind, row, title: title(row) })
        report.trashed += 1
      } else {
        out.push(row)
      }
    }
    return out
  }

  const rows: LegacyRows = {
    characters: split(all.characters, 'character', (row) => row.name),
    countries: split(all.countries, 'country', (row) => row.name),
    events: split(all.events, 'event', (row) => row.title),
    worldEntries: split(all.worldEntries, 'worldEntry', (row) => row.title),
    tags: all.tags,
    periods: split(all.periods, 'period', (row) => row.name),
    meta: all.meta,
  }

  const occupied = new Set<string>()

  // 目标文件夹里已有的笔记：同名判定与「就地更新」都要用
  const existing = await vaultFs.scan(root)
  const contentByPath = new Map<string, string>()
  /** 文件名（去扩展名、小写）→ 已有文件路径；同名多篇只认第一篇 */
  const byBaseName = new Map<string, string>()

  for (const file of existing.files) {
    const relPath = normalizeRelPath(file.relPath)
    if (relPath.startsWith('.ocstudio/')) continue
    occupied.add(relPath)
    contentByPath.set(relPath, file.content)
    const base = relPath.slice(relPath.lastIndexOf('/') + 1).replace(/\.md$/i, '').toLowerCase()
    if (!byBaseName.has(base)) byBaseName.set(base, relPath)
  }
  for (const path of existing.otherFiles) occupied.add(normalizeRelPath(path))

  // replace：先把已有笔记整批挪进回收站（移动，不是删除）
  if (strategy === 'replace' && contentByPath.size > 0) {
    for (const relPath of contentByPath.keys()) {
      try {
        await vaultFs.move(root, relPath, trashRelPath(relPath))
        occupied.delete(relPath)
        report.movedToTrash += 1
      } catch (err) {
        report.moveErrors.push(`${relPath}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    contentByPath.clear()
    byBaseName.clear()
  }

  // 1. 图片先落地：实体里的引用改写完，后面序列化才能写对路径
  const imageMap = await materializeImages(root, rows, occupied, report)
  applyImageMap(rows, imageMap)

  // 2. 笔记
  const ctx = buildContext(rows)
  const texts: { relPath: string; content: string }[] = []

  for (const kind of KINDS) {
    const list = [...rowsOfKind(rows, kind)] as { id: number; name?: string; title?: string; countryId?: number }[]
    // 按 id 排序：同一批数据每次迁移得到同一套文件名，便于比对与回滚
    list.sort((a, b) => a.id - b.id)

    for (const row of list) {
      const title = titleOf(kind, row)
      const hit = byBaseName.get(sanitizeFileName(title).toLowerCase())

      if (hit !== undefined && strategy === 'skip') {
        report.skippedExisting += 1
        continue
      }

      let relPath: string
      if (hit !== undefined && strategy === 'overwrite') {
        // 就地更新：拿原文件当底稿，改完只替换我们拥有的那几行，用户自造的键原样保留
        relPath = hit
        texts.push({ relPath, content: composeNote(kind, row, ctx, contentByPath.get(hit)) })
        report.overwritten += 1
      } else {
        const hint =
          kind === 'character' && typeof row.countryId === 'number'
            ? ctx.nameOf('country', row.countryId)
            : undefined
        const folder = hit === undefined ? pickPreferredFolder(kind, [], hint) : folderOf(hit)
        relPath = allocateRelPath(kind, title, occupied, folder)
        texts.push({ relPath, content: composeNote(kind, row, ctx) })
        report.created += 1
      }

      occupied.add(relPath)
      if (kind === 'period') report.periods += 1
      else report.notes += 1
    }
  }

  // 3. 回收站：同样的内容，路径塞进 .ocstudio/trash/ 下
  for (const item of trashedRows) {
    const folder = `.ocstudio/trash/${pickPreferredFolder(item.kind, [])}`
    const relPath = allocateRelPath(item.kind, item.title, occupied, folder)
    occupied.add(relPath)
    texts.push({ relPath, content: composeNote(item.kind, item.row, ctx) })
  }

  if (texts.length > 0) {
    const results = await vaultFs.writeTexts(root, texts)
    const failed = results.filter((result) => !result.ok)
    if (failed.length > 0) {
      throw new Error(`写了 ${texts.length - failed.length} 篇，${failed.length} 篇失败：${failed[0]?.error ?? '未知错误'}`)
    }
  }

  // 3. 项目级元信息：标记文件（世界名 / 一句话 / 封面）
  const worldName = (rows.meta?.worldName ?? '').trim() || folderNameOf(root)
  const marker = buildMarkerContent(
    worldName,
    (rows.meta?.tagline ?? '').trim(),
    (rows.meta?.coverUrl ?? '').trim(),
  )
  await vaultFs.writeTexts(root, [{ relPath: MARKER_REL_PATH, content: marker }])

  // 4. 标签颜色/分类：vault 里标签没有独立文件，元数据集中放 tags.json
  if (rows.tags.length > 0) {
    const content = serializeTagMeta(tagMetaFromTags(rows.tags))
    await vaultFs.writeTexts(root, [{ relPath: TAG_META_REL_PATH, content }])
  }

  // 5. 字段表：不写它就等于「所有自定义字段消失」（序列化只写登记过的键）
  await vaultFs.writeTexts(root, [
    { relPath: FIELDS_REL_PATH, content: serializeFieldConfig(getFieldConfig()) },
  ])

  return report
}
