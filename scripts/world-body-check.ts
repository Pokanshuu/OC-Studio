/**
 * 词条正文收敛自检：`npx tsx scripts/world-body-check.ts`（`npm run audit:world`)
 *
 * 验 `lib/world-body.ts` 那个唯一读入口认不认识历史上出现过的**四种**存法，
 * 以及有没有人偷偷绕开它直接读 `content`。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hasWorldBody, worldBodyOf, worldBodyPatch } from '../src/lib/world-body'

let passed = 0
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1
    return
  }
  console.error(`  FAIL ${name}${detail ? `：${detail}` : ''}`)
  process.exitCode = 1
}

const doc = { type: 'doc', content: [{ type: 'paragraph' }] }

function main(): void {
  // ── 四种存法 ──────────────────────────────────────────────────────────
  check('正字段：document 对象直接用', worldBodyOf({ document: doc }) === doc)

  const legacyJson = JSON.stringify(doc)
  check('老字段：content 里的 JSON 字符串解析成对象', (worldBodyOf({ content: legacyJson }) as { type?: string }).type === 'doc')

  check('老数据：content 直接是纯文本', worldBodyOf({ content: '就是一段话' }) === '就是一段话')
  check('老数据：content 是 Markdown', worldBodyOf({ content: '# 标题\n\n正文' }) === '# 标题\n\n正文')

  check('两样都有时 document 优先', worldBodyOf({ document: doc, content: '{"type":"旧"}' }) === doc)

  check('都没有是空串', worldBodyOf({}) === '')
  check('空 content 是空串', worldBodyOf({ content: '   ' }) === '')
  check('document 是 null 时回落 content', worldBodyOf({ document: null, content: '兜底' }) === '兜底')
  check('content 是坏 JSON 时当纯文本', worldBodyOf({ content: '{not json' }) === '{not json')

  // ── 空态判断 ──────────────────────────────────────────────────────────
  check('有文档算有正文', hasWorldBody({ document: doc }))
  check('有文字算有正文', hasWorldBody({ content: '字' }))
  check('没有正文', !hasWorldBody({}))
  check('空白不算正文', !hasWorldBody({ content: '  \n ' }))

  // ── 写入补丁 ──────────────────────────────────────────────────────────
  const patch = worldBodyPatch(doc)
  check('补丁写 document', patch.document === doc)
  check('补丁清空 content', patch.content === '')

  // ── 结构守卫：别再造出第二份真源 ──────────────────────────────────────
  const root = join(import.meta.dirname ?? process.cwd(), '..')
  const bridge = readFileSync(join(root, 'src/lib/vault/markdown-bridge.ts'), 'utf8')
  check(
    '装载时不再把正文序列化进 content',
    !/entity\.content\s*=\s*JSON\.stringify/.test(bridge) && !/JSON\.stringify\(doc\)/.test(bridge),
  )

  const worldServices = readFileSync(join(root, 'src/features/world/services.ts'), 'utf8')
  check('保存正文走 worldBodyPatch', worldServices.includes('worldBodyPatch(doc)'))
  check('保存正文不再直接写 content', !/worldEntries\.update\(id,\s*\{\s*title,\s*content,/.test(worldServices))

  // 助手写正文是另一个入口 —— 这里曾经漏过：它给词条单独拼了一份 JSON 写进 content，
  // 等于把刚收敛掉的两份真源又装回来一份。
  const hostTools = readFileSync(join(root, 'src/plugins/agent/host/library-tools.ts'), 'utf8')
  check('助手写正文也走 worldBodyPatch', hostTools.includes('worldBodyPatch('))
  check('助手写正文不再按 kind 分叉拼 JSON', !/kind === 'world' \? \{ content:/.test(hostTools))

  console.log(`词条正文收敛自检：${passed} 项断言通过`)
}

main()
