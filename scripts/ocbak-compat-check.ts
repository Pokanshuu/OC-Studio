/**
 * 备份兼容自检：`npx tsx scripts/ocbak-compat-check.ts`
 * 验 `validateImportData` 能认 fork 的 version 2，并把 maps 计入统计而不报错。
 */
import { validateImportData } from '../src/lib/import'

let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed += 1; console.log(`  OK ${name}`) }
  else { console.error(`  FAIL ${name}`); process.exitCode = 1 }
}

const row = (name: string) => ({ id: 1, name, deleted: false, createdAt: 1, updatedAt: 1 })

const v1 = {
  version: 1,
  exportedAt: '2026-11-01T00:00:00.000Z',
  data: { characters: [row('A')], events: [{ id: 1, title: 'E' }], countries: [row('C')], worldEntries: [{ id: 1, title: 'W' }], tags: [row('T')] },
}

const v2 = {
  version: 2,
  exportedAt: '2026-11-02T00:00:00.000Z',
  meta: { app: 'OC Studio', format: 'oc-studio-backup', offline: true, includes: [] },
  data: {
    ...v1.data,
    maps: [{ id: 1, name: '世界', seed: 42, params: {}, createdAt: 1, updatedAt: 1 }],
  },
}

const s1 = validateImportData(v1)
check('version 1 正常', s1.characters === 1 && s1.maps === undefined)

const s2 = validateImportData(v2)
check('version 2 被接受', s2.characters === 1)
check('fork 的 maps 只统计', s2.maps === 1)

let threw = false
try { validateImportData({ version: 9, data: v1.data }) } catch { threw = true }
check('未知版本仍然拒绝', threw)

let missing = false
try { validateImportData({ version: 2, data: { characters: [] } }) } catch { missing = true }
check('缺表仍然报错', missing)

console.log(`\n共 ${passed} 项断言通过`)
