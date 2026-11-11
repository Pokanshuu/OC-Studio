/**
 * vault 路径分配自检：`npx tsx scripts/vault-paths-check.ts`
 * 只验纯函数，不碰磁盘 / Dexie。
 */
import {
  allocateRelPath,
  foldersOfKind,
  novelChapterFileTitle,
  pickPreferredFolder,
  sanitizeFileName,
} from '../src/lib/vault/vault-paths'
import { batchStartedAt, shouldPurgeBatch } from '../src/features/trash/retention'

let passed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1
    return
  }
  failures.push(detail ? `${name}：${detail}` : name)
}

check('章节文件名加第 01 章前缀', novelChapterFileTitle('新章节', 1) === '第01章-新章节')
check('章节序号补零', novelChapterFileTitle('初遇', 12) === '第12章-初遇')
check('标题自带章号不重复', novelChapterFileTitle('第03章-初遇', 1) === '第03章-初遇')
check('序号至少从 1 开始', novelChapterFileTitle('序', 0) === '第01章-序')

const path = allocateRelPath('worldEntry', '新章节', new Set(), '小说', '第01章-新章节')
check('小说章节落 小说/ 目录', path === '小说/第01章-新章节.md', path)
const collided = allocateRelPath('worldEntry', '新章节', new Set([path]), '小说', '第01章-新章节')
check('撞名自动加序号', collided === '小说/第01章-新章节 (2).md', collided)

// 回收站恢复撞名：删掉「亚瑟」后又建了一个「亚瑟」，恢复旧的那条不能永远失败
// （`vault_move` 对已存在的目标会直接报错），要按同一套规则改名到 `亚瑟 (2).md`
const restoreTarget = '角色/亚瑟.md'
const occupiedByNew = new Set([restoreTarget])
const renamedRestore = allocateRelPath(
  'character',
  '亚瑟',
  occupiedByNew,
  restoreTarget.slice(0, restoreTarget.lastIndexOf('/')),
  restoreTarget.slice(restoreTarget.lastIndexOf('/') + 1).replace(/\.md$/i, ''),
)
check('回收站恢复撞名时改名而不是覆盖', renamedRestore === '角色/亚瑟 (2).md', renamedRestore)

// ── 回收站自动清理：宁可留着，也不能清错 ──────────────────────────────
// 删的是用户文件，规则错一条就是数据事故：名字认不出 / 两个时间有一个不老，都必须跳过。
const day = 24 * 60 * 60 * 1000
const oldStart = new Date('2025-01-02T03:04:05').getTime()
const cutoff = oldStart + 31 * day
check('批次名解析出的是删除那天', batchStartedAt('20250102-030405') === oldStart)
check('批次名长度不对不认', batchStartedAt('2025010-030405') === null)
check('批次名分隔符不对不认', batchStartedAt('20250102_030405') === null)
check('批次名混字母不认', batchStartedAt('20250102-03040a') === null)
check('两边都过期才清', shouldPurgeBatch('20250102-030405', oldStart, cutoff))
check(
  '目录 mtime 不老就不清（时钟 / 手工改名的双保险）',
  !shouldPurgeBatch('20250102-030405', cutoff + day, cutoff),
)
check(
  '名字里的时间不老就不清（目录 mtime 被碰过）',
  !shouldPurgeBatch('20261111-183005', oldStart, cutoff),
)
check('名字认不出的批次一律不动', !shouldPurgeBatch('trash', oldStart, cutoff))
check('Windows 非法字符被清掉', sanitizeFileName('a/b:c*?"<>|') === 'a b c')

// ── 新建条目的落点：回收站与 .ocstudio 不能参与推断 ──────────────────────
// 事故形状：把某类型的条目全删进回收站，再新建一条 —— 回收站里的 relPath
// （`.ocstudio/trash/<批次>/国家/x.md`）还在会话索引里，顶层投票投给 `.ocstudio`，
// 新文件就写进 `.ocstudio/` 根下，`国家/` 反而是空的。
const trashedOnly = [
  { kind: 'country', relPath: '.ocstudio/trash/20261110-120000/国家/灰烬自治领.md', trashed: true },
]
check('回收站里的条目不算「这个类型的目录」', foldersOfKind(trashedOnly, 'country').length === 0)
check(
  '只剩回收站条目时回落默认目录',
  pickPreferredFolder('country', foldersOfKind(trashedOnly, 'country')) === '国家',
)

const mixedFolders = [
  { kind: 'character', relPath: '20.角色/林知遥.md', trashed: false },
  { kind: 'character', relPath: '20.角色/沈砚.md', trashed: false },
  { kind: 'character', relPath: '.ocstudio/trash/20261110-120000/角色/旧角色.md', trashed: true },
]
check(
  '回收站里的目录不参与投票',
  foldersOfKind(mixedFolders, 'character').join('|') === '20.角色|20.角色',
  foldersOfKind(mixedFolders, 'character').join('|'),
)
check(
  '沿用用户自己的编号目录',
  pickPreferredFolder('character', foldersOfKind(mixedFolders, 'character')) === '20.角色',
)

// 自我延续：一旦有文件被写进 `.ocstudio/`，它不能继续把后面每一条也拖进去
const alreadyStray = [{ kind: 'country', relPath: '.ocstudio/穹顶洋联邦.md', trashed: false }]
check('已落在 .ocstudio 的条目也不投票', foldersOfKind(alreadyStray, 'country').length === 0)
check(
  '直接递进内部目录也会被挡掉',
  pickPreferredFolder('country', ['.ocstudio/trash/20261110-120000/国家']) === '国家',
)

if (failures.length > 0) {
  console.error('vault 路径自检失败：')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(`vault 路径自检通过：${passed} 项断言`)
