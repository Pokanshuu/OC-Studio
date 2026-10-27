/**
 * 离线 vault 体检脚本。
 *
 * 复用 app 内的解析层（src/lib/vault）对**真实目录**跑一遍，
 * 不依赖 Tauri / Dexie / 浏览器，用来在动任何写入逻辑之前先看清：
 * 目录会被映射成哪些实体、链接能不能解析、有哪些脏数据。
 *
 * 用法：
 *   npx tsx scripts/vault-analyze.ts "D:\path\to\vault" [--samples]
 */
import { readdirSync, readFileSync, statSync, type Dirent } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { scanVault } from '../src/lib/vault/scan'
import { serializeEntity, type SerializeContext } from '../src/lib/vault/serialize'
import { setBody, setFrontmatterKeys } from '../src/lib/vault/frontmatter'
import {
  applyDocumentBodies,
  createLinkSerializer,
  documentOfEntity,
  serializeBody,
} from '../src/lib/vault/markdown-bridge'
import type { VaultFileEntry, VaultScanResult, VaultStorableKind } from '../src/lib/vault/types'

const SKIP_DIRS = new Set(['node_modules', '.git', '.obsidian', '.trash'])
const MARKER = 'oc-studio.json'

interface CollectResult {
  files: VaultFileEntry[]
  skippedDirs: string[]
  marker: string | null
  totalBytes: number
}

function collect(root: string): CollectResult {
  const files: VaultFileEntry[] = []
  const skippedDirs: string[] = []
  let marker: string | null = null
  let totalBytes = 0

  const walk = (dir: string): void => {
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch (err) {
      skippedDirs.push(`${toRel(root, dir)} (不可读: ${String(err)})`)
      return
    }

    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) {
          skippedDirs.push(toRel(root, full))
          continue
        }
        walk(full)
        continue
      }
      if (!entry.isFile()) continue

      if (entry.name === MARKER) {
        marker = readFileSync(full, 'utf8')
        continue
      }
      if (!entry.name.toLowerCase().endsWith('.md')) continue

      const stat = statSync(full)
      const content = readFileSync(full, 'utf8')
      totalBytes += stat.size
      files.push({
        relPath: toRel(root, full),
        content,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      })
    }
  }

  walk(root)
  return { files, skippedDirs, marker, totalBytes }
}

function toRel(root: string, full: string): string {
  return relative(root, full).split(sep).join('/')
}

function pct(part: number, total: number): string {
  if (total === 0) return '0%'
  return `${((part / total) * 100).toFixed(1)}%`
}

function printReport(result: VaultScanResult, collected: CollectResult): void {
  const { report } = result
  const line = (text = ''): void => { process.stdout.write(`${text}\n`) }
  const rule = (title: string): void => {
    line()
    line(`── ${title} ${'─'.repeat(Math.max(0, 58 - title.length))}`)
  }

  rule('总览')
  line(`  根目录      ${report.root}`)
  line(`  md 文件     ${report.noteCount} 个（${(collected.totalBytes / 1024).toFixed(0)} KB）`)
  line(`  空文件      ${report.emptyFiles.length}`)
  line(`  跳过目录    ${report.skippedDirs.length}${report.skippedDirs.length > 0 ? `（${report.skippedDirs.slice(0, 4).join(', ')}${report.skippedDirs.length > 4 ? ', …' : ''}）` : ''}`)
  line(`  标记文件    ${collected.marker === null ? '无（外来 vault，不会自动创建）' : '有'}`)

  rule('按类型落库')
  const kindLabels: Record<string, string> = {
    character: '角色',
    country: '国家',
    event: '事件',
    worldEntry: '词条',
    tag: '标签',
    period: '时期',
    ignore: '未映射',
  }
  for (const [kind, count] of Object.entries(report.byKind)) {
    if (count === 0) continue
    line(`  ${(kindLabels[kind] ?? kind).padEnd(6, '　')} ${String(count).padStart(3)} 个文件`)
  }
  line(`  ${'数据集'.padEnd(5, '　')} 角色 ${result.dataset.characters.length} / 国家 ${result.dataset.countries.length} / 事件 ${result.dataset.events.length} / 词条 ${result.dataset.worldEntries.length} / 标签 ${result.dataset.tags.length}`)

  rule('目录 → 类型')
  for (const folder of report.folders) {
    line(`  ${folder.folder.padEnd(22)} → ${(kindLabels[folder.kind] ?? folder.kind).padEnd(5, '　')} ${String(folder.count).padStart(3)} 个`)
  }

  rule('链接')
  const { links } = report
  line(`  总计 ${links.total} 处 / ${links.distinct} 个不同目标`)
  line(`  已解析 ${links.resolved}（${pct(links.resolved, links.total)}），其中经由别名 ${links.viaAlias}`)
  line(`  未解析 ${links.unresolved.length} 个目标，涉及 ${links.unresolved.reduce((sum, item) => sum + item.count, 0)} 处`)
  if (links.ambiguous.length > 0) {
    line(`  歧义   ${links.ambiguous.length} 个目标指向多个文件`)
    for (const item of links.ambiguous.slice(0, 10)) {
      line(`    · ${item.target}（${item.count} 处）→ ${item.ambiguous.join(' | ')}`)
    }
  }
  if (links.unresolved.length > 0) {
    line('  未解析明细：')
    for (const item of links.unresolved.slice(0, 25)) {
      line(`    · ${item.target.padEnd(16)} ${String(item.count).padStart(3)} 处   来自 ${item.sources.slice(0, 3).join(', ')}`)
    }
    if (links.unresolved.length > 25) line(`    … 另有 ${links.unresolved.length - 25} 个`)
  }

  rule('别名')
  line(`  声明别名 ${report.aliases.total} 个，被正文引用到的 ${report.aliases.usedByLinks} 个（${pct(report.aliases.usedByLinks, report.aliases.total)}）`)
  if (report.aliases.conflicts.length > 0) {
    line(`  冲突 ${report.aliases.conflicts.length} 个：`)
    for (const item of report.aliases.conflicts.slice(0, 10)) {
      line(`    · ${item.alias} ← ${item.paths.join(', ')}`)
    }
  } else {
    line('  冲突 无')
  }

  rule('frontmatter 键频次')
  line(`  ${report.frontmatterKeys.map((item) => `${item.key}(${item.count})`).join('  ')}`)

  if (report.unresolvedFactions.length > 0) {
    rule('阵营软引用（名字没有对应词条，可一键创建）')
    line(`  ${report.unresolvedFactions.length} 个阵营名未建词条：`)
    for (const item of report.unresolvedFactions.slice(0, 12)) {
      line(`    · ${item.name.padEnd(26)} ${String(item.count).padStart(2)} 人`)
    }
    if (report.unresolvedFactions.length > 12) {
      line(`    … 另有 ${report.unresolvedFactions.length - 12} 个`)
    }
  }

  if (report.duplicateKeys.length > 0) {
    rule('解析键重复')
    for (const item of report.duplicateKeys.slice(0, 12)) {
      line(`  · ${item.key} ← ${item.paths.join(' | ')}`)
    }
  }

  if (report.emptyFiles.length > 0) {
    rule('空文件')
    for (const path of report.emptyFiles) line(`  · ${path}`)
  }

  if (report.unmapped.length > 0) {
    rule('未映射（目录不在关键词表，只报告不改动）')
    for (const item of report.unmapped) line(`  · ${item.relPath}   （目录：${item.folder === '' ? '根目录' : item.folder}）`)
  }

  if (report.unparsedFrontmatter.length > 0) {
    rule('frontmatter 解析失败')
    for (const item of report.unparsedFrontmatter) line(`  · ${item.relPath}\n      ${item.error}`)
  }
}

function buildSerializeContext(result: VaultScanResult): SerializeContext {
  const characterById = new Map(result.dataset.characters.map((item) => [item.entity.id, item.entity.name]))
  const countryById = new Map(result.dataset.countries.map((item) => [item.entity.id, item.entity.name]))
  const eventById = new Map(result.dataset.events.map((item) => [item.entity.id, item.entity.title]))
  const worldById = new Map(result.dataset.worldEntries.map((item) => [item.entity.id, item.entity.title]))
  const tagById = new Map(result.dataset.tags.map((item) => [item.entity.id, item.entity.name]))

  return {
    nameOf: (kind, id) => {
      switch (kind) {
        case 'character':
          return characterById.get(id)
        case 'country':
          return countryById.get(id)
        case 'event':
          return eventById.get(id)
        case 'worldEntry':
          return worldById.get(id)
        case 'tag':
          return tagById.get(id)
        default:
          return undefined
      }
    },
    tagName: (id) => tagById.get(id),
  }
}

interface SlotRef {
  kind: VaultStorableKind
  entity: unknown
  frontmatter: Record<string, unknown>
  /** 装载时的正文原文（正文没变就不该重写） */
  body: string
  /** 装载时正文对应的编辑器文档（JSON）—— 与真实写回用同一判据 */
  bodyDoc: string
}

interface RewriteResult {
  files: VaultFileEntry[]
  changedPaths: string[]
  keysWritten: number
  bodiesWritten: number
}

/**
 * 用扫描结果把每个实体序列化回文件。
 * **刻意与 vault-persist 的 planTextWrite 保持同一套逻辑**（frontmatter + 正文分开处理），
 * 这样离线验证的结论才代表应用真实写盘的行为。
 */
function rewrite(
  files: VaultFileEntry[],
  result: VaultScanResult,
  ctx: SerializeContext,
  mutate?: (kind: VaultStorableKind, entity: unknown) => unknown,
): RewriteResult {
  const slots = new Map<string, SlotRef>()

  const add = (kind: VaultStorableKind, entries: { entity: unknown; relPath: string }[]): void => {
    for (const entry of entries) {
      if (entry.relPath === '') continue
      const note = result.notes.find((item) => item.relPath === entry.relPath)
      slots.set(entry.relPath, {
        kind,
        entity: entry.entity,
        frontmatter: note?.frontmatter ?? {},
        body: note?.body ?? '',
        bodyDoc: JSON.stringify(documentOfEntity(kind, entry.entity) ?? null),
      })
    }
  }

  add('character', result.dataset.characters)
  add('country', result.dataset.countries)
  add('event', result.dataset.events)
  add('worldEntry', result.dataset.worldEntries)
  add('tag', result.dataset.tags)

  const serializeLink = createLinkSerializer((kind, id) => ctx.nameOf(kind, id))

  const changedPaths: string[] = []
  let keysWritten = 0
  let bodiesWritten = 0

  const out = files.map((file) => {
    const rel = file.relPath.replace(/\\/g, '/')
    const slot = slots.get(rel)
    if (slot === undefined) return file

    const next = mutate === undefined ? slot.entity : mutate(slot.kind, slot.entity)
    const updates = serializeEntity(
      slot.kind,
      next,
      slot.entity,
      { entity: slot.entity, frontmatter: slot.frontmatter },
      ctx,
    )

    let content = setFrontmatterKeys(file.content, updates)
    let bodyChanged = false

    // 判据与 vault-persist 一致：比较**文档**，不是比较正文文本
    const nowDocJson = JSON.stringify(documentOfEntity(slot.kind, next) ?? null)
    const body = nowDocJson === slot.bodyDoc ? null : serializeBody(slot.kind, next, serializeLink)
    if (body !== null && body.markdown !== slot.body) {
      content = setBody(content, body.markdown)
      bodyChanged = true
      bodiesWritten += 1
    }

    const keys = Object.keys(updates)
    if (keys.length === 0 && !bodyChanged) return file

    keysWritten += keys.length
    if (content !== file.content) changedPaths.push(rel)
    return { ...file, content }
  })

  return { files: out, changedPaths, keysWritten, bodiesWritten }
}

function scanFiles(files: VaultFileEntry[], root: string, collected: CollectResult): VaultScanResult {
  const scan = scanVault({
    root,
    files,
    skippedDirs: collected.skippedDirs,
    marker: collected.marker,
  })
  // 正文桥：把每篇的 Markdown 转成编辑器文档，序列化时才有东西可写
  applyDocumentBodies(scan)
  return scan
}

/**
 * 往返一致性：这是「保存会不会弄脏用户的文件」的证明。
 *
 * A. 什么都没改 → 写回必须零改动、零键写入。
 * B. 模拟一处编辑 → 只有那一个文件被改；再读回来字段一致；再写回为零（格式是不动点）。
 */
function checkRoundTrip(root: string, collected: CollectResult): number {
  const line = (text = ''): void => { process.stdout.write(`${text}\n`) }
  line()
  line(`── 往返一致性 ${'─'.repeat(46)}`)

  let problems = 0

  // ── A. 零改动（含正文） ──────────────────────────────────────────
  const first = scanFiles(collected.files, root, collected)
  const ctxA = buildSerializeContext(first)
  const noop = rewrite(collected.files, first, ctxA)
  const noopOk = noop.changedPaths.length === 0 && noop.keysWritten === 0 && noop.bodiesWritten === 0
  line(`  A 无编辑保存      改动 ${noop.changedPaths.length} 文件 / ${noop.keysWritten} 键 / ${noop.bodiesWritten} 篇正文${noopOk ? '  ✓' : '  ✗'}`)
  if (noop.changedPaths.length > 0) {
    for (const path of noop.changedPaths.slice(0, 8)) line(`      · ${path}`)
    problems += noop.changedPaths.length
  }

  // ── B. 模拟编辑 → 写回 → 读回 ────────────────────────────────────
  const target = first.dataset.characters[0]
  if (target === undefined) {
    line('  B 编辑往返        跳过（没有角色）')
    return problems
  }

  const relTarget = target.relPath
  const editedFaction = `${target.entity.faction}（测试）`
  const editedAliases = [...target.entity.aliases, '测试别名']

  const edited = rewrite(collected.files, first, ctxA, (kind, entity) => {
    if (kind !== 'character') return entity
    const character = entity as { name: string }
    if (character.name !== target.entity.name) return entity
    return { ...(entity as object), faction: editedFaction, aliases: editedAliases, isMajor: true }
  })

  line(`  B 单处编辑保存    改动 ${edited.changedPaths.length} 文件 / ${edited.keysWritten} 键 / ${edited.bodiesWritten} 篇正文${edited.changedPaths.length === 1 && edited.bodiesWritten === 0 ? '  ✓' : '  ✗'}`)

  const reread = scanFiles(edited.files, root, collected)
  const back = reread.dataset.characters.find((item) => item.relPath === relTarget)
  const fieldsOk =
    back !== undefined &&
    back.entity.faction === editedFaction &&
    back.entity.isMajor === true &&
    JSON.stringify(back.entity.aliases) === JSON.stringify(editedAliases)

  line(`  B 读回字段一致    ${fieldsOk ? '✓' : '✗'}  faction=${JSON.stringify(back?.entity.faction)} isMajor=${String(back?.entity.isMajor)} aliases=${JSON.stringify(back?.entity.aliases)}`)
  if (!fieldsOk) problems += 1

  // ── B2. 正文往返：改一处正文 → 只有那一篇被改 → 读回的文档与改动一致 ──
  const bodyTarget = first.dataset.characters.find((item) => item.bodyMarkdown.trim() !== '')
  if (bodyTarget !== undefined) {
    const editedBody = `${bodyTarget.bodyMarkdown.trimEnd()}\n\n## 往返测试小节\n\n这一段是脚本追加的。\n`

    // 构造「正文被改过」的输入：把磁盘上那一篇的正文换掉，再走一遍扫描 + 序列化。
    // 若正文层能无损往返，第二次写回应当是零改动，且增补的小节在读回后仍在。
    const patched = collected.files.map((file) =>
      file.relPath.replace(/\\/g, '/') === bodyTarget.relPath
        ? { ...file, content: setBody(file.content, editedBody) }
        : file,
    )
    const rereadBody = scanFiles(patched, root, collected)
    const ctxBody = buildSerializeContext(rereadBody)
    const stableBody = rewrite(patched, rereadBody, ctxBody)
    const backBody = rereadBody.dataset.characters.find((item) => item.relPath === bodyTarget.relPath)
    const bodyOk =
      stableBody.bodiesWritten === 0 &&
      backBody !== undefined &&
      backBody.bodyMarkdown.includes('往返测试小节')

    line(`  B2 正文往返       二次写回 ${stableBody.bodiesWritten} 篇正文 / 小节保留 ${backBody?.bodyMarkdown.includes('往返测试小节') === true ? '是' : '否'}${bodyOk ? '  ✓' : '  ✗'}  （${bodyTarget.relPath}）`)
    if (!bodyOk) problems += 1
  }

  // ── C. 编辑后是否仍是不动点 ──────────────────────────────────────
  const ctxC = buildSerializeContext(reread)
  const stable = rewrite(edited.files, reread, ctxC)
  const stableOk = stable.changedPaths.length === 0 && stable.keysWritten === 0 && stable.bodiesWritten === 0
  line(`  C 编辑后再保存    改动 ${stable.changedPaths.length} 文件 / ${stable.keysWritten} 键 / ${stable.bodiesWritten} 篇正文${stableOk ? '  ✓（不动点）' : '  ✗'}`)
  if (stable.changedPaths.length > 0) {
    for (const path of stable.changedPaths.slice(0, 8)) line(`      · ${path}`)
    problems += stable.changedPaths.length
  }

  return problems
}

function printSamples(result: VaultScanResult): void {
  const line = (text = ''): void => { process.stdout.write(`${text}\n`) }
  line()
  line('── 抽样：字段映射结果 ' + '─'.repeat(34))

  const character = result.dataset.characters[0]
  if (character) {
    line(`  角色  ${character.relPath}`)
    line(`    ${JSON.stringify(character.entity, null, 2).split('\n').join('\n    ')}`)
  }

  const country = result.dataset.countries[0]
  if (country) {
    line(`  国家  ${country.relPath}`)
    line(`    name=${country.entity.name}  tags=${JSON.stringify(country.entity.tags)}  createdAt=${new Date(country.entity.createdAt).toISOString().slice(0, 10)}`)
  }

  const entry = result.dataset.worldEntries[0]
  if (entry) {
    line(`  词条  ${entry.relPath}`)
    line(`    title=${entry.entity.title}  category=${entry.entity.category}  order=${entry.entity.order}`)
  }

  const withAlias = result.dataset.characters.find((item) => item.entity.aliases.length > 0)
  if (withAlias) {
    line(`  带别名的角色  ${withAlias.relPath}`)
    line(`    name=${withAlias.entity.name}  aliases=${JSON.stringify(withAlias.entity.aliases)}  countryId=${String(withAlias.entity.countryId)}`)
  }

  const tagSample = result.dataset.tags.slice(0, 8).map((tag) => `${tag.entity.name}${tag.relPath === '' ? '' : '*'}`)
  line(`  标签（前 8，* 表示有独立文件）  ${tagSample.join(', ')}`)
}

function main(): void {
  const root = process.argv[2]
  if (!root) {
    process.stderr.write('用法: npx tsx scripts/vault-analyze.ts <vault 路径> [--samples]\n')
    process.exit(2)
  }

  const collected = collect(root)
  const result = scanVault({
    root,
    files: collected.files,
    skippedDirs: collected.skippedDirs,
    marker: collected.marker,
  })

  printReport(result, collected)
  let problems = 0
  if (process.argv.includes('--roundtrip')) problems = checkRoundTrip(root, collected)
  if (process.argv.includes('--samples')) printSamples(result)
  if (problems > 0) process.exit(1)
}

main()
