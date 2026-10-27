/**
 * 文件夹级写盘验收。
 *
 * 之前的 `vault-analyze --roundtrip` 是在**内存里**比字符串。这个脚本走真实文件：
 *   1. 把真实 vault 整个复制到临时目录
 *   2. 记录每个文件的 sha256
 *   3. 用应用的写盘管线（scanVault → applyDocumentBodies → serializeEntity/serializeBody
 *      → setFrontmatterKeys/setBody）执行三处改动：
 *        a) 改一个角色的阵营（只动 frontmatter）
 *        b) 给某篇正文追加一节（只动正文）
 *        c) 新建一个角色（走路径分配 + 文件名消毒）
 *   4. 重新哈希：**被动的必须只有预期的文件，其余逐字节不变**
 *   5. 重新扫描：改动要能读回来，新实体要出现在正确目录
 *
 * 用法：npx tsx scripts/vault-write-acceptance.ts "D:\path\to\vault"
 */
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, type Dirent } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'

import { setBody, setFrontmatterKeys } from '../src/lib/vault/frontmatter'
import { applyDocumentBodies, createLinkSerializer, documentOfEntity, serializeBody } from '../src/lib/vault/markdown-bridge'
import { serializeEntity, type SerializeContext } from '../src/lib/vault/serialize'
import { scanVault } from '../src/lib/vault/scan'
import { allocateRelPath, normalizeRelPath, pickPreferredFolder } from '../src/lib/vault/vault-paths'
import { allocateAssetPath, collectAppDataImages, planImageRewrites } from '../src/lib/vault/vault-migrate'
import type { VaultEntityKind, VaultFileEntry, VaultScanResult } from '../src/lib/vault/types'

const SKIP_DIRS = new Set(['node_modules', '.git', '.ocstudio', '.trash'])

function collectText(root: string): VaultFileEntry[] {
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
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        walk(full)
        continue
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue
      const content = readFileSync(full, 'utf8')
      out.push({ relPath: relative(root, full).split(sep).join('/'), content, size: 0, mtimeMs: 0 })
    }
  }
  walk(root)
  return out
}

function hashAll(root: string): Map<string, string> {
  const map = new Map<string, string>()
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
        walk(full)
        continue
      }
      if (!entry.isFile()) continue
      const rel = relative(root, full).split(sep).join('/')
      map.set(rel, createHash('sha256').update(readFileSync(full)).digest('hex'))
    }
  }
  walk(root)
  return map
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

function buildContext(scan: VaultScanResult): SerializeContext {
  return { nameOf: (kind, id) => nameOf(scan, kind, id), tagName: (id) => scan.dataset.tags.find((t) => t.entity.id === id)?.entity.name }
}

function main(): void {
  const source = process.argv[2]
  if (!source) {
    process.stderr.write('用法: npx tsx scripts/vault-write-acceptance.ts <vault 路径>\n')
    process.exit(2)
  }

  const stamp = Date.now().toString(36)
  const work = join(tmpdir(), `ocstudio-acceptance-${stamp}`)
  if (existsSync(work)) rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  cpSync(source, work, { recursive: true })

  const line = (text = ''): void => { process.stdout.write(`${text}\n`) }
  const problems: string[] = []

  const before = hashAll(work)
  const files = collectText(work)
  const scan = scanVault({ root: work, files, skippedDirs: [], marker: null })
  applyDocumentBodies(scan)
  const ctx = buildContext(scan)
  const serializeLink = createLinkSerializer((kind, id) => nameOf(scan, kind, id))

  line(`工作副本  ${work}`)
  line(`md 文件   ${files.length} 个（全目录文件 ${before.size} 个）`)

  // ── a) 改一个角色的阵营：只应动 frontmatter ──────────────────────
  const character = scan.dataset.characters.find((item) => item.relPath !== '')
  const edits: { relPath: string; content: string; expectBody: boolean }[] = []

  if (character !== undefined) {
    const next = { ...character.entity, faction: `${character.entity.faction}｜验收` }
    const updates = serializeEntity('character', next, character.entity, {
      entity: character.entity,
      frontmatter: scan.notes.find((n) => n.relPath === character.relPath)?.frontmatter ?? {},
    }, ctx)
    const original = files.find((f) => f.relPath === character.relPath)?.content ?? ''
    edits.push({
      relPath: character.relPath,
      content: setFrontmatterKeys(original, updates),
      expectBody: false,
    })
    line(`\na) 改阵营  ${character.relPath}  写入 ${Object.keys(updates).length} 个键：${Object.keys(updates).join(', ')}`)
  }

  // ── b) 给一篇正文追加一节：只应动正文 ────────────────────────────
  const withBody = scan.dataset.characters.find((item) => item.bodyMarkdown.trim() !== '' && item.relPath !== character?.relPath)
  if (withBody !== undefined) {
    const original = files.find((f) => f.relPath === withBody.relPath)?.content ?? ''
    const parsedDoc = documentOfEntity('character', withBody.entity)
    if (parsedDoc !== null && typeof parsedDoc === 'object') {
      const doc = parsedDoc as { content?: unknown[] }
      const appended = {
        ...(parsedDoc as object),
        content: [
          ...(Array.isArray(doc.content) ? doc.content : []),
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '验收小节' }] },
          { type: 'paragraph', content: [{ type: 'text', text: '这一段由验收脚本追加。' }] },
        ],
      }
      const body = serializeBody('character', { ...withBody.entity, document: appended }, serializeLink)
      if (body !== null) {
        edits.push({ relPath: withBody.relPath, content: setBody(original, body.markdown), expectBody: true })
        line(`b) 追加正文 ${withBody.relPath}  正文 ${body.markdown.length} 字符`)
      }
    }
  }

  // ── c) 新建一个角色：走真实的路径分配 ────────────────────────────
  const session = { occupied: new Set(before.keys()) }
  const folder = pickPreferredFolder('character', scan.dataset.characters.map((c) => c.relPath.split('/').slice(0, -1).join('/')), '示例国')
  const newRel = allocateRelPath('character', '验收角色：带/非法字符*的', session.occupied, folder)
  const newEntity = {
    id: 9999,
    name: '验收角色：带/非法字符*的',
    aliases: [],
    race: '人类',
    element: '火',
    occupation: '测试',
    faction: '验收阵营',
    nationalityLegacy: '示例国',
    height: '',
    birthday: '',
    avatarUrl: '',
    bio: '',
    lifeStory: '',
    relatedCharacters: [],
    gallery: [],
    avatars: [],
    tags: [],
    isMajor: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deleted: false,
    _syncStatus: 'synced',
    _lastModified: Date.now(),
  }
  const newUpdates = serializeEntity('character', newEntity, null, { entity: null, frontmatter: {} }, ctx)
  let newContent = setFrontmatterKeys('', newUpdates)
  const newBody = serializeBody('character', newEntity, serializeLink)
  if (newBody !== null && newBody.markdown !== '') newContent = setBody(newContent, newBody.markdown)
  edits.push({ relPath: newRel, content: newContent, expectBody: true })
  line(`c) 新建角色 ${newRel}`)

  // ── 落盘 ────────────────────────────────────────────────────────
  for (const edit of edits) {
    const full = join(work, edit.relPath)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, edit.content, 'utf8')
  }

  // ── 只有预期的文件能动 ──────────────────────────────────────────
  const after = hashAll(work)
  const expected = new Set(edits.map((e) => normalizeRelPath(e.relPath)))
  const changed: string[] = []
  for (const [path, hash] of after) {
    if (before.get(path) !== hash) changed.push(path)
  }
  const created = [...after.keys()].filter((path) => !before.has(path))
  const removed = [...before.keys()].filter((path) => !after.has(path))

  line('\n── 谁被改动了 ' + '─'.repeat(40))
  const unexpected = changed.filter((path) => !expected.has(normalizeRelPath(path)))
  line(`  预期改动 ${expected.size} 个 · 实际改动 ${changed.length} 个 · 新建 ${created.length} 个 · 删除 ${removed.length} 个`)
  for (const path of changed) line(`    ${expected.has(normalizeRelPath(path)) ? '✓' : '✗'} ${path}`)
  if (unexpected.length > 0) problems.push(`有 ${unexpected.length} 个非预期文件被改动`)
  if (removed.length > 0) problems.push(`有 ${removed.length} 个文件被删除`)

  // ── 改动要能读回来 ──────────────────────────────────────────────
  line('\n── 读回校验 ' + '─'.repeat(42))
  const rereadFiles = collectText(work)
  const reread = scanVault({ root: work, files: rereadFiles, skippedDirs: [], marker: null })
  applyDocumentBodies(reread)

  if (character !== undefined) {
    const back = reread.dataset.characters.find((item) => item.relPath === character.relPath)
    const ok = back?.entity.faction === `${character.entity.faction}｜验收`
    line(`  a 阵营读回        ${ok ? '✓' : '✗'}  ${JSON.stringify(back?.entity.faction)}`)
    if (!ok) problems.push('阵营改动未读回')
    const bodySame = back?.bodyMarkdown === character.bodyMarkdown
    line(`  a 正文未被波及    ${bodySame ? '✓' : '✗'}`)
    if (!bodySame) problems.push('只改 frontmatter 却动了正文')
  }

  if (withBody !== undefined) {
    const back = reread.dataset.characters.find((item) => item.relPath === withBody.relPath)
    const ok = back?.bodyMarkdown.includes('验收小节') === true
    line(`  b 正文小节读回    ${ok ? '✓' : '✗'}`)
    if (!ok) problems.push('正文改动未读回')
    const stable = scan.dataset.characters.find((item) => item.relPath === withBody.relPath)
    void stable
    const other = reread.dataset.characters.filter(
      (item) => item.relPath !== withBody.relPath && item.relPath !== character?.relPath,
    )
    const untouched = other.every((item) => {
      const orig = scan.dataset.characters.find((o) => o.relPath === item.relPath)
      // 新建的文件没有「改动前」可比，跳过
      if (orig === undefined) return true
      return orig.bodyMarkdown === item.bodyMarkdown
    })
    line(`  b 其余笔记正文未动 ${untouched ? '✓' : '✗'}（比对 ${other.length} 篇）`)
    if (!untouched) {
      const offenders = other.filter((item) => {
        const orig = scan.dataset.characters.find((o) => o.relPath === item.relPath)
        return orig !== undefined && orig.bodyMarkdown !== item.bodyMarkdown
      })
      for (const offender of offenders.slice(0, 5)) line(`      ✗ ${offender.relPath}`)
      problems.push('改一篇正文却波及了别的笔记')
    }
  }

  const added = reread.dataset.characters.find((item) => item.relPath === normalizeRelPath(newRel))
  line(`  c 新角色读回      ${added === undefined ? '✗' : '✓'}  ${added?.relPath ?? ''}`)
  if (added === undefined) problems.push('新角色未出现在数据集里')
  else {
    line(`     名称=${JSON.stringify(added.entity.name)} 阵营=${JSON.stringify(added.entity.faction)} 主要角色=${String(added.entity.isMajor)}`)
    if (added.entity.name !== '验收角色：带/非法字符*的') problems.push('新角色名称读回不一致')
  }

  line('\n' + '─'.repeat(50) + '\n── 标记文件 ↔ 项目元信息 ' + '─'.repeat(22))

  // 新建 vault 会写 oc-studio.json；这条路径此前没有被任何检查覆盖。
  const markerPath = join(work, 'oc-studio.json')
  writeFileSync(
    markerPath,
    `${JSON.stringify({ app: 'oc-studio', schemaVersion: 1, project: { worldName: '验收世界', tagline: '一句话', cover: '附件/封面.png' } }, null, 2)}\n`,
    'utf8',
  )
  const withMarker = scanVault({
    root: work,
    files: collectText(work),
    skippedDirs: [],
    marker: readFileSync(markerPath, 'utf8'),
  })
  const project = withMarker.dataset.project
  const markerOk =
    project !== null &&
    project.entity.worldName === '验收世界' &&
    project.entity.tagline === '一句话' &&
    project.entity.coverUrl === '附件/封面.png' &&
    project.relPath === 'oc-studio.json'
  line(`  标记 → 项目元信息  ${markerOk ? '✓' : '✗'}  worldName=${JSON.stringify(project?.entity.worldName)} tagline=${JSON.stringify(project?.entity.tagline)} relPath=${JSON.stringify(project?.relPath)}`)
  if (!markerOk) problems.push('标记文件的项目元信息未正确读入')

  // 没有标记文件时**不能**凭空造一个 relPath（否则会往外来 vault 根目录写文件）
  const noMarker = scanVault({ root: work, files: collectText(work), skippedDirs: [], marker: null })
  const noMarkerOk = noMarker.dataset.project !== null && noMarker.dataset.project.relPath === ''
  line(`  无标记时不落盘     ${noMarkerOk ? '✓' : '✗'}  relPath=${JSON.stringify(noMarker.dataset.project?.relPath)}`)
  if (!noMarkerOk) problems.push('无标记文件时不应给出可写路径')

  line('\n' + '─'.repeat(50) + '\n── 图片迁移的引用改写 ' + '─'.repeat(28))

  // 只测纯函数：把「哪些引用要搬」与「怎么改写」钉住。
  // 真实搬文件需要 Tauri 运行环境（vaultFs.importFile），这里不覆盖。
  const rows = {
    characters: [{
      id: 1,
      avatarUrl: 'images/a.png',
      headerUrl: '附件/已在vault.png',
      gallery: [{ url: 'images/b.png', caption: 'x' }, { url: '附件/c.png', caption: '' }],
      avatars: [{ url: 'images/d.png', type: 'portrait' }],
    }],
    countries: [{ id: 2, flagUrl: 'images/e.png', headerUrl: 'images/f.png' }],
    events: [{ id: 3, headerUrl: 'images/g.png', images: [{ url: 'images/h.png', caption: '' }] }],
    meta: [{ id: 1, coverUrl: 'images/i.png' }, { id: 2, coverUrl: '附件/已在vault.png' }],
  } as unknown as Parameters<typeof collectAppDataImages>[0]

  const candidates = collectAppDataImages(rows)
  const expectedCandidates = [
    'images/a.png', 'images/b.png', 'images/d.png', 'images/e.png',
    'images/f.png', 'images/g.png', 'images/h.png', 'images/i.png',
  ]
  const candidatesOk =
    candidates.length === expectedCandidates.length &&
    expectedCandidates.every((item) => candidates.includes(item))
  line(`  候选收集           ${candidatesOk ? '✓' : '✗'}  ${candidates.length} 个（vault 内的不算）`)
  if (!candidatesOk) problems.push(`图片候选收集不正确：${candidates.join(', ')}`)

  const map = new Map(candidates.map((item) => [item, `附件/mig-${item.slice('images/'.length)}`]))
  const patches = planImageRewrites(rows, map)
  const serializedPatches = JSON.stringify(patches)
  const allSwapped = !serializedPatches.includes('"images/')

  // 「vault 内引用未动」必须精确到字段：数组被整体写回时，其中未改动的项
  // 当然会出现在 patch 里（这是对的），所以不能拿整串去搜。
  const characterPatch = patches.find((item) => item.table === 'characters')
  const headerUntouched = characterPatch !== undefined && !('headerUrl' in characterPatch.patch)
  const metaUntouched = patches.every((item) => !(item.table === 'meta' && item.id === 2))

  line(`  改写覆盖           ${allSwapped ? '✓' : '✗'}  ${patches.length} 行（角色/国家/事件/项目 各一）`)
  line(`  未改动字段不进 patch ${headerUntouched && metaUntouched ? '✓' : '✗'}  headerUrl 未列入=${String(headerUntouched)} 纯 vault 项目行未列入=${String(metaUntouched)}`)
  if (!allSwapped) problems.push('仍有未被改写的 images/ 引用')
  if (!headerUntouched) problems.push('已指向 vault 的 headerUrl 被误列入 patch')
  if (!metaUntouched) problems.push('只用 vault 图片的项目元信息被误列入 patch')
  if (patches.length !== 4) problems.push(`应改写 4 行，实际 ${patches.length}`)

  const allocated = allocateAssetPath('附件', 'a.png', new Set(['附件/a.png', '附件/a-2.png']))
  const allocOk = allocated === '附件/a-3.png'
  line(`  撞名去重           ${allocOk ? '✓' : '✗'}  ${allocated}`)
  if (!allocOk) problems.push(`素材撞名去重不正确：${allocated}`)

  line('\n' + '─'.repeat(50))
  if (problems.length === 0) {
    line('全部通过 ✓')
    process.stdout.write(`（工作副本保留在 ${work}，可自行打开核对）\n`)
  } else {
    line(`失败 ${problems.length} 项：`)
    for (const problem of problems) line(`  · ${problem}`)
    process.exitCode = 1
  }
}

main()
