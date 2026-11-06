/**
 * vault 路径分配自检：`npx tsx scripts/vault-paths-check.ts`
 * 只验纯函数，不碰磁盘 / Dexie。
 */
import { allocateRelPath, novelChapterFileTitle, sanitizeFileName } from '../src/lib/vault/vault-paths'

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
check('Windows 非法字符被清掉', sanitizeFileName('a/b:c*?"<>|') === 'a b c')

if (failures.length > 0) {
  console.error('vault 路径自检失败：')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(`vault 路径自检通过：${passed} 项断言`)
