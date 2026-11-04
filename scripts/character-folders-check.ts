/**
 * 角色文件夹纯函数自检：`npx tsx scripts/character-folders-check.ts`
 */
import { listFolders, UNGROUPED } from '../src/features/characters/folders'
import type { Character } from '../src/types'

let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed += 1; console.log(`  OK ${name}`) }
  else { console.error(`  FAIL ${name}`); process.exitCode = 1 }
}

const make = (id: number, name: string, folder?: string) => ({ id, name, folder, deleted: false }) as unknown as Character

const rows = [make(1, 'A', '同伴'), make(2, 'B', '同伴'), make(3, 'C', '敌人'), make(4, 'D'), make(5, 'E', '  ')]

const { folders, ungrouped } = listFolders(rows)
check('文件夹去重并计数', folders.length === 2 && folders.find((f) => f.name === '同伴')?.count === 2)
const expected = ['同伴', '敌人'].sort((a, b) => a.localeCompare(b, 'zh-Hans'))
check('文件夹按名字排序', folders.map((f) => f.name).join(',') === expected.join(','))
check('空字符串算未分组', ungrouped === 2)
check('未分组标题是中性的', UNGROUPED === '未分组')

console.log(`\n共 ${passed} 项断言通过`)
