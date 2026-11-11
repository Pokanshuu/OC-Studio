/**
 * 一条命令跑完所有 `audit:*` 自检：`node scripts/audit-all.mjs [关键词]`
 *
 * 为什么不是 package.json 里一串 && ：
 * - 24 条脚本串在 JSON 里要写 800 多个字符，读不出哪条挂了；
 * - 这里逐条跑、逐条报，最后给一张「过 / 挂」清单，失败时退出码非 0（CI 直接可用）。
 *
 * 带关键词时只跑名字包含它的那几条（调试单条时方便）：
 *   node scripts/audit-all.mjs vault
 *
 * 说明：子进程用 `stdio: 'inherit'`，不捕获输出 —— 各脚本自己的报告原样打到屏幕上，
 * 也避免在受限沙箱里因为「管道」被拒。
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const all = Object.keys(pkg.scripts ?? {}).filter((name) => name.startsWith('audit:'))
const filter = process.argv[2] ?? ''
const targets = all.filter((name) => name.includes(filter))

if (targets.length === 0) {
  console.error(filter === '' ? '没有找到任何 audit:* 脚本' : `没有名字包含「${filter}」的 audit 脚本`)
  process.exit(1)
}

const isWindows = process.platform === 'win32'
const failures = []
const startedAt = Date.now()

for (const name of targets) {
  process.stdout.write(`\n▶ ${name}\n`)
  const result = spawnSync('npm', ['run', name], { stdio: 'inherit', shell: isWindows })
  if (result.status !== 0) failures.push(name)
}

const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
process.stdout.write(`\n${'─'.repeat(48)}\n`)
if (failures.length === 0) {
  console.log(`自检通过：${targets.length} 条脚本全绿（${seconds}s）`)
  process.exit(0)
}
console.error(`自检失败 ${failures.length}/${targets.length}（${seconds}s）：`)
for (const name of failures) console.error(`  ✗ ${name}`)
process.exit(1)
