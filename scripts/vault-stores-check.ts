/**
 * 模板 / 组件四份配置的**写路径自检**（`npm run audit:stores`）。
 *
 * 为什么单独做一个脚本：这里的几条不变量只在"写盘那一刻"成立 ——
 * 删模板要连文件一起删、装载完成前不许写、连点两个参数两个都要留下、
 * 字段迁移必须走在模板升级前面。读代码看不出来，得上真实代码 + 假盘跑一遍。
 *
 * 做法：用一个内存 `Map` 接住 Tauri 的 `invoke`，其余全是真 store。
 * **不碰真库**，不写任何文件。
 *
 * 场景顺序有依赖：「装载完成前不许写」必须在任何一次 load 之前跑
 * （`loaded` 是模块级状态），所以它排第一个。其余场景用互不相同的模板 id，
 * 互不干扰。
 */
import { createVaultSession, setVaultSession } from '../src/lib/vault/vault-session'

const disk = new Map<string, string>()
/** 这些路径的写入会被故意判失败（用来验证「字段迁移失败时不许升级模板」） */
const failWrites = new Set<string>()

function arg(args: Record<string, unknown> | undefined, key: string): string {
  const raw = args?.[key] ?? args?.[key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)]
  return typeof raw === 'string' ? raw : ''
}

function listDir(subdir: string): { name: string; relPath: string; size: number; mtimeMs: number }[] {
  const prefix = subdir.replace(/\\/g, '/').replace(/\/+$/, '') + '/'
  const out: { name: string; relPath: string; size: number; mtimeMs: number }[] = []
  for (const [relPath, content] of disk) {
    if (!relPath.startsWith(prefix)) continue
    const rest = relPath.slice(prefix.length)
    if (rest.includes('/')) continue
    out.push({ name: rest, relPath, size: content.length, mtimeMs: 1 })
  }
  return out
}

async function invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
  switch (command) {
    case 'vault_list_assets':
      return listDir(arg(args, 'subdir'))
    case 'vault_read_bytes': {
      const relPath = arg(args, 'relPath')
      if (!disk.has(relPath)) throw `读取失败：${relPath} 不存在`
      return Array.from(Buffer.from(disk.get(relPath) as string, 'utf8'))
    }
    case 'vault_write_texts': {
      const entries = (args?.entries ?? []) as { relPath: string; content: string }[]
      return entries.map((entry) => {
        const relPath = entry.relPath.replace(/\\/g, '/')
        if (failWrites.has(relPath)) {
          return { relPath, ok: false, conflict: false, mtimeMs: null, error: `模拟写入失败：${relPath}` }
        }
        disk.set(relPath, entry.content)
        return { relPath, ok: true, conflict: false, mtimeMs: 2, error: null }
      })
    }
    case 'vault_remove':
      disk.delete(arg(args, 'relPath'))
      return null
    case 'vault_exists':
      return disk.has(arg(args, 'relPath'))
    case 'vault_mkdir':
      return null
    default:
      throw new Error(`自检没模拟这个命令：${command}`)
  }
}

const scope = globalThis as unknown as { window: unknown }
scope.window = { __TAURI_INTERNALS__: { invoke } }
setVaultSession(createVaultSession('C:/oc-studio-audit-vault'))

let failures = 0
function check(ok: boolean, message: string): void {
  if (ok) {
    console.log(`  ✓ ${message}`)
    return
  }
  failures += 1
  console.error(`  ✗ ${message}`)
}

const TPL = '.ocstudio/templates/'
const GROUPS = '.ocstudio/info-groups.json'

/** 一份最小可用的模板文件 */
function templateFile(id: string, name: string, components: string[], extra: string[] = []): string {
  return [
    '---',
    `id: ${id}`,
    `名称: ${name}`,
    ...extra,
    '组件:',
    ...components.flatMap((component) => [`  - id: ${component}`, '    开: true']),
    '---',
    '',
  ].join('\n')
}

// 包一层 async main：这个仓库是 CJS 输出，脚本里不能直接写顶层 await
async function main(): Promise<void> {
  console.log('模板 / 组件写路径自检：')

// ── 1. 装载完成之前不能写（否则拿内置默认覆盖用户盘上的模板）──────────
{
  disk.clear()
  disk.set(`${TPL}s-early.md`, templateFile('s-early', '早期', ['body'], ['版本: 3']))
  const before = JSON.stringify([...disk])
  const store = await import('../src/lib/templates/store')
  let rejected = ''
  await store.saveTemplates([]).catch((err: unknown) => {
    rejected = err instanceof Error ? err.message : String(err)
  })
  check(rejected !== '', `装载完成前的保存被拒绝（实际：${rejected || '居然写成功了'}）`)
  check(JSON.stringify([...disk]) === before, '被拒绝的那次保存没动盘上任何文件')
}

// ── 2. 删除模板要连文件一起删，重启不许复活 ───────────────────────────
{
  disk.clear()
  disk.set(`${TPL}s-del-a.md`, templateFile('s-del-a', '甲', ['body'], ['版本: 3']))
  disk.set(`${TPL}s-del-b.md`, templateFile('s-del-b', '乙', ['body'], ['版本: 3']))
  const store = await import('../src/lib/templates/store')
  await store.loadTemplates(true)
  check(
    store.getTemplates().some((doc) => doc.id === 's-del-a'),
    '装载后能看到「甲」',
  )
  await store.deleteTemplate('s-del-a')
  check(!disk.has(`${TPL}s-del-a.md`), '删除后它的 .md 文件也没了（以前只删内存，重启就复活）')
  check(disk.has(`${TPL}s-del-b.md`), '没连累别的模板文件')
  await store.loadTemplates(true)
  check(!store.getTemplates().some((doc) => doc.id === 's-del-a'), '重新装载后删掉的模板没有回来')
}

// ── 3. 连点两个参数：两个都得留下 ──────────────────────────────────
{
  disk.clear()
  disk.set(
    `${TPL}s-cc.md`,
    templateFile('s-cc', '连点', ['gallery', 'body'], ['版本: 3']),
  )
  const store = await import('../src/lib/templates/store')
  await store.loadTemplates(true)
  // 故意不 await：模拟两次点击在同一帧里发出去
  const first = store.setTemplateComponentParams('s-cc', 'gallery', { columns: 2 })
  const second = store.setTemplateComponentParams('s-cc', 'gallery', { mode: 'slider' })
  await Promise.all([first, second])
  const written = disk.get(`${TPL}s-cc.md`) ?? ''
  check(written.includes('columns: 2'), '第一个参数落盘了')
  check(written.includes('mode: slider'), '第二个参数也落盘了（没被后一次覆盖）')
}

// ── 4. 字段迁移失败时，模板文件不许升到 版本: 3 ─────────────────────
{
  disk.clear()
  const legacy = [
    '---',
    'id: s-note',
    '名称: 旧笔记',
    '组件:',
    '  - id: info',
    '    开: true',
    '    参数:',
    '      group: group-pet',
    '  - id: time',
    '    开: true',
    '  - id: place',
    '    开: true',
    '  - id: body',
    '    开: true',
    '---',
    '',
  ].join('\n')
  disk.set(`${TPL}s-note.md`, legacy)
  disk.set(GROUPS, JSON.stringify({ version: 1, groups: [{ id: 'group-pet', name: '宠物', fields: ['物种'] }] }, null, 2))

  const store = await import('../src/lib/templates/store')
  failWrites.add(GROUPS)
  await store.loadTemplates(true)
  const stillLegacy = disk.get(`${TPL}s-note.md`) ?? ''
  check(!stillLegacy.includes('版本'), '字段没落盘时，模板文件没有被升级（升级了下次就不再补字段）')
  check(stillLegacy.includes('id: time'), '模板里的时间组件也还在，等下次开库再迁')

  // ── 5. 放开写入：这一次要两边都落地 ──────────────────────────────
  failWrites.clear()
  await store.loadTemplates(true)
  const groups = await import('../src/lib/templates/info-groups')
  await groups.loadInfoGroups()
  const groupFile = disk.get(GROUPS) ?? ''
  check(groupFile.includes('"endTime": "timeEnd"'), '时间 / 结束时间 / 地点补成了基本信息的字段行')
  const migrated = disk.get(`${TPL}s-note.md`) ?? ''
  check(migrated.includes('版本: 3'), '字段落盘之后模板才升到 版本: 3')
  check(!migrated.includes('id: time'), '退役的时间组件从模板文件里移除了')
}

// ── 6. id 和文件名不一致时，写回原来那份文件 ────────────────────────
{
  disk.clear()
  disk.set(`${TPL}renamed-s.md`, templateFile('s-rename', '原名', ['body'], ['版本: 3']))
  const store = await import('../src/lib/templates/store')
  await store.loadTemplates(true)
  const doc = store.getTemplates().find((item) => item.id === 's-rename')
  check(doc !== undefined, '认出了 renamed-s.md 里的模板')
  if (doc) await store.saveTemplate({ ...doc, name: '改过的名字' })
  check(disk.has(`${TPL}renamed-s.md`), '写回了它原来那份文件')
  check(!disk.has(`${TPL}s-rename.md`), '没有按 id 另开一份（否则旧文件永远删不掉、重启后谁生效看目录顺序）')
  check((disk.get(`${TPL}renamed-s.md`) ?? '').includes('改过的名字'), '文件内容确实更新了')
}

// ── 7. 内置组件不许删（删了下次读盘又回来，用户会以为删不掉）──────────
{
  const groups = await import('../src/lib/templates/info-groups')
  const bodies = await import('../src/lib/templates/body-groups')
  let infoRejected = ''
  await groups.deleteInfoGroup('group-pet').catch((err: unknown) => {
    infoRejected = err instanceof Error ? err.message : String(err)
  })
  check(infoRejected.includes('不能删除'), '内置基本信息组件删不掉，且给出了原因')
  let bodyRejected = ''
  await bodies.deleteBodyGroup('body-empty').catch((err: unknown) => {
    bodyRejected = err instanceof Error ? err.message : String(err)
  })
  check(bodyRejected.includes('不能删除'), '内置正文组件删不掉，且给出了原因')
}

  if (failures === 0) {
    console.log('  ✓ 通过（7 个场景）')
    process.exit(0)
  }
  console.error(`\n${failures} 项未通过`)
  process.exit(1)
}

void main()
