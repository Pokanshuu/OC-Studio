/**
 * frontmatter / 正文外科式读写的恒等性检查。
 *
 * 只验证**手术原语**本身，不涉及 markdown 桥，因此可以在正文桥未就绪时独立跑：
 *   1. parse(source).body 再 setBody 回去，必须与原文逐字节相同
 *   2. setFrontmatterKeys(source, {}) 必须与原文逐字节相同
 *   3. 二者串联（先改 frontmatter 再改正文）也必须稳定
 *
 * 用法：npx tsx scripts/vault-frontmatter-check.ts "D:\path\to\vault"
 */
import { readdirSync, readFileSync, type Dirent } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { parseFrontmatter, setBody, setFrontmatterKeys } from '../src/lib/vault/frontmatter'

const SKIP = new Set(['node_modules', '.git', '.obsidian', '.ocstudio', '.trash'])

function collectMarkdown(root: string): { relPath: string; content: string }[] {
  const out: { relPath: string; content: string }[] = []

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
      out.push({ relPath: relative(root, full).split(sep).join('/'), content: readFileSync(full, 'utf8') })
    }
  }

  walk(root)
  return out
}

function main(): void {
  const root = process.argv[2]
  if (!root) {
    process.stderr.write('用法: npx tsx scripts/vault-frontmatter-check.ts <vault 路径>\n')
    process.exit(2)
  }

  const files = collectMarkdown(root)
  const failures: { relPath: string; kind: string }[] = []
  let withFrontmatter = 0

  for (const file of files) {
    const parsed = parseFrontmatter(file.content)
    if (parsed.raw !== null) withFrontmatter += 1

    // 1. 正文抽出再写回
    const restored = setBody(file.content, parsed.body)
    if (restored !== file.content) failures.push({ relPath: file.relPath, kind: 'setBody 恒等' })

    // 2. 空更新不应改动任何字节
    const untouched = setFrontmatterKeys(file.content, {})
    if (untouched !== file.content) failures.push({ relPath: file.relPath, kind: '空更新恒等' })

    // 3. 串联：改一个我们拥有的键（再删掉）之后，正文部分必须不变
    if (parsed.raw !== null) {
      const roundTripped = setBody(setFrontmatterKeys(file.content, { __probe: 'x' }), parsed.body)
      const backAgain = setBody(setFrontmatterKeys(roundTripped, { __probe: undefined }), parsed.body)
      if (parseFrontmatter(backAgain).body !== parsed.body) {
        failures.push({ relPath: file.relPath, kind: '增删键后正文漂移' })
      }
    }
  }

  process.stdout.write(`文件 ${files.length} 个（含 frontmatter ${withFrontmatter} 个）\n`)
  process.stdout.write(`失败 ${failures.length} 项\n`)
  for (const failure of failures.slice(0, 20)) {
    process.stdout.write(`  · [${failure.kind}] ${failure.relPath}\n`)
  }
  if (failures.length > 0) process.exit(1)
}

main()
