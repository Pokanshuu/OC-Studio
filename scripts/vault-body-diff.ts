/**
 * 正文往返差异归因。
 *
 * 应用写盘时是**把整份正文替换**的（frontmatter 与正文分开处理），
 * 所以要求比「文档幂等」更强：`serialize(parse(md)) === md` **逐字节**相等。
 * 否则用户只改一段话，整篇排版会被“规范化”，diff 惨不忍睹。
 *
 * 本脚本把每篇的差异归到一个可读的签名上（首处不同的行对），
 * 用来定位序列化器与文件既有风格的偏差。
 *
 * 用法：npx tsx scripts/vault-body-diff.ts "D:\path\to\vault" [--show N]
 */
import { readdirSync, readFileSync, type Dirent } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { scanVault } from '../src/lib/vault/scan'
import { applyDocumentBodies, createLinkSerializer, serializeBody } from '../src/lib/vault/markdown-bridge'
import type { VaultEntityKind, VaultFileEntry, VaultScanResult } from '../src/lib/vault/types'

const SKIP = new Set(['node_modules', '.git', '.obsidian', '.ocstudio', '.trash'])

function collect(root: string): VaultFileEntry[] {
  const out: VaultFileEntry[] = []
  const walk = (dir: string): void => {
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue
        walk(full)
        continue
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue
      const content = readFileSync(full, 'utf8')
      out.push({
        relPath: relative(root, full).split(sep).join('/'),
        content,
        size: Buffer.byteLength(content, 'utf8'),
        mtimeMs: 0,
      })
    }
  }
  walk(root)
  return out
}

function nameOf(scan: VaultScanResult, kind: VaultEntityKind, id: number): string | undefined {
  switch (kind) {
    case 'character':
      return scan.dataset.characters.find((item) => item.entity.id === id)?.entity.name
    case 'country':
      return scan.dataset.countries.find((item) => item.entity.id === id)?.entity.name
    case 'event':
      return scan.dataset.events.find((item) => item.entity.id === id)?.entity.title
    case 'worldEntry':
      return scan.dataset.worldEntries.find((item) => item.entity.id === id)?.entity.title
    default:
      return undefined
  }
}

/** 找出首处不同的行，做成可聚合的签名 */
function diffSignature(before: string, after: string): { signature: string; context: string } {
  const a = before.split('\n')
  const b = after.split('\n')
  const max = Math.max(a.length, b.length)

  for (let i = 0; i < max; i++) {
    const left = a[i]
    const right = b[i]
    if (left === right) continue
    const signature = left === undefined
      ? `多出一行：${JSON.stringify((right ?? '').slice(0, 28))}`
      : right === undefined
        ? `少了一行：${JSON.stringify((left ?? '').slice(0, 28))}`
        : `行不同：${JSON.stringify((left ?? '').slice(0, 28))} → ${JSON.stringify((right ?? '').slice(0, 28))}`
    return { signature, context: `第 ${i + 1} 行` }
  }
  return { signature: '长度不同但行相同（尾随换行）', context: '' }
}

function main(): void {
  const root = process.argv[2]
  if (!root) {
    process.stderr.write('用法: npx tsx scripts/vault-body-diff.ts <vault 路径> [--show N]\n')
    process.exit(2)
  }
  const showIndex = process.argv.indexOf('--show')
  const show = showIndex >= 0 ? Number.parseInt(process.argv[showIndex + 1] ?? '5', 10) : 5
  const fullIndex = process.argv.indexOf('--full')
  const fullPath = fullIndex >= 0 ? (process.argv[fullIndex + 1] ?? null) : null

  const files = collect(root)
  const scan = scanVault({ root, files, skippedDirs: [], marker: null })
  applyDocumentBodies(scan)

  const serializeLink = createLinkSerializer((kind, id) => nameOf(scan, kind, id))
  const groups = new Map<string, { count: number; examples: string[] }>()
  let stable = 0
  const fallbackFiles: string[] = []

  const targets: { relPath: string; kind: 'character' | 'country' | 'event' | 'worldEntry'; body: string; entity: unknown }[] = [
    ...scan.dataset.characters.map((item) => ({ relPath: item.relPath, kind: 'character' as const, body: item.bodyMarkdown, entity: item.entity })),
    ...scan.dataset.countries.map((item) => ({ relPath: item.relPath, kind: 'country' as const, body: item.bodyMarkdown, entity: item.entity })),
    ...scan.dataset.events.map((item) => ({ relPath: item.relPath, kind: 'event' as const, body: item.bodyMarkdown, entity: item.entity })),
    ...scan.dataset.worldEntries.map((item) => ({ relPath: item.relPath, kind: 'worldEntry' as const, body: item.bodyMarkdown, entity: item.entity })),
  ]

  for (const target of targets) {
    const result = serializeBody(target.kind, target.entity, serializeLink)
    if (result === null) continue
    if (result.hasFallback) fallbackFiles.push(target.relPath)
    if (result.markdown === target.body) {
      stable += 1
      continue
    }
    if (fullPath !== null && target.relPath === fullPath) {
      process.stdout.write(`\n===== ${target.relPath} =====\n`)
      process.stdout.write(`----- 原文 -----\n${target.body}\n`)
      process.stdout.write(`----- 序列化后 -----\n${result.markdown}\n`)
    }
    const { signature, context } = diffSignature(target.body, result.markdown)
    const entry = groups.get(signature) ?? { count: 0, examples: [] }
    entry.count += 1
    if (entry.examples.length < show) entry.examples.push(`${target.relPath}${context === '' ? '' : `（${context}）`}`)
    groups.set(signature, entry)
  }

  const line = (text = ''): void => { process.stdout.write(`${text}\n`) }
  line(`有正文的实体 ${targets.length} 个`)
  line(`正文逐字节稳定 ${stable} 个`)
  line(`正文被改写     ${targets.length - stable} 个`)
  line(`触发兜底块     ${fallbackFiles.length} 个${fallbackFiles.length > 0 ? `（${fallbackFiles.slice(0, 5).join(', ')}${fallbackFiles.length > 5 ? '…' : ''}）` : ''}`)
  line()
  line('── 差异签名（按出现次数排序） ' + '─'.repeat(30))
  const sorted = [...groups.entries()].sort((a, b) => b[1].count - a[1].count)
  for (const [signature, entry] of sorted.slice(0, 25)) {
    line(`  ${String(entry.count).padStart(3)} 次  ${signature}`)
    for (const example of entry.examples.slice(0, 3)) line(`           · ${example}`)
  }
  if (sorted.length > 25) line(`  … 另有 ${sorted.length - 25} 种签名`)
}

main()
