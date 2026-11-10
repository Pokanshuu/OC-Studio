/**
 * 助手 token 效率对照（改前 vs 改后）+ 真实循环交叉验证。
 *
 * 不是审计、不进 CI —— 用同一套 `estimateTokens` 把「一次任务的累计 prompt」
 * 算出来，给的是**比较值**：模型每步都要重放系统前缀 + 历史 + 工具结果，
 * 所以省工具结果与省步数，比省前缀更值钱。
 *
 * 前提（都是 2026-11-10 那轮改动前的实测 / 代码事实）：
 * - 旧前缀 = 4,758（工具）+ 1,188（字段表）+ 295（人格）= 6,241 tokens
 * - 新前缀 = 工具 + 能力卡片 + 人格（本脚本现算）
 * - 环境块与库目录两版都有，按同一段文本计入
 * - 每条消息加 8 tokens 的 role / 工具调用框架开销（近似）
 * - 旧版 `library_set_fields` 会把整条（含正文）读回来；新版只给回执 + 字段
 * - 最后一段走真实 `runAgentLoop`（假模型 / 假工具），验证裁剪真的发生在回放路径上
 *
 * 运行：npm run measure:agent-tokens
 */
import { ALL_TOOLS, toOpenAiTools } from '../src/plugins/agent/core/agent/tools'
import { agentEnvironment, agentInstructions } from '../src/plugins/agent/core/agent/prompt'
import { LIBRARY_MODEL_MARKDOWN } from '../src/plugins/agent/host/library-model.generated'
import { estimateTokens } from '../src/plugins/agent/core/tokenEstimate'
import { clipToolResult } from '../src/plugins/agent/core/agent/budget'
import { runAgentLoop } from '../src/plugins/agent/core/agent/loop'

const ctx = {
  language: 'zh' as const,
  workspacePath: null,
  workspaceName: '我的设定集',
  toolNames: ALL_TOOLS.map((tool) => tool.name),
  platform: 'Windows',
  date: '2026-11-10',
}
const env = agentEnvironment(ctx)
const catalog = [
  '# 库目录',
  '角色 42 条 · 事件 18 条 · 国家 9 条 · 词条 63 条',
  '分类：人物 / 地点 / 组织 / 宠物 / 武器 / 小说 / 地图',
  '模板：角色 / 事件 / 国家 / 词条 / 宠物 / 武器（各含基本信息与正文组件）',
  '标签：主角 / 配角 / 反派 / 已故 / 传说',
].join('\n')

const newPrefix =
  estimateTokens(env) +
  estimateTokens(agentInstructions('zh')) +
  estimateTokens(LIBRARY_MODEL_MARKDOWN) +
  estimateTokens(catalog) +
  estimateTokens(JSON.stringify(toOpenAiTools(ALL_TOOLS)))
const OLD_TOOLS_AND_GUIDE = 4758 + 1188 + 295
const oldPrefix = OLD_TOOLS_AND_GUIDE + estimateTokens(env) + estimateTokens(catalog)

interface Turn {
  /** 模型的文字（可有可无） */
  text: string
  tool?: string
  /** 工具参数，按实际发出去的 JSON 字符数计 */
  args?: string
  result?: string
}

interface Run {
  calls: number
  promptTokens: number
  perCall: number[]
}

/**
 * 模拟一次任务：每次模型调用前，把「系统前缀 + 已有消息」量一遍。
 * 工具结果只影响**之后**的调用 —— 这正是复利所在。
 */
function simulate(prefixTokens: number, turns: Turn[]): Run {
  const messages: { role: string; content: string }[] = [{ role: 'user', content: '请改一下林知遥的种族和职业，改完告诉我。' }]
  const perCall: number[] = []
  for (const turn of turns) {
    const body = messages.map((message) => message.content).join('\n')
    perCall.push(prefixTokens + estimateTokens(body) + messages.length * 8)
    messages.push({ role: 'assistant', content: `${turn.text}${turn.tool ? `\n[tool ${turn.tool} ${turn.args ?? ''}]` : ''}` })
    if (turn.result !== undefined) {
      messages.push({ role: 'tool', content: turn.result })
    }
  }
  return {
    calls: turns.length,
    promptTokens: perCall.reduce((sum, value) => sum + value, 0),
    perCall,
  }
}

// ── 任务 A：读一条长正文 → 改两个字段 → 旧版再读一遍验证 ──────────────
const body = '林知遥在灰烬平原上测绘星图。'.repeat(600) // 约 12,000 字
const fieldsLine = '字段：种族 人类 · 职业 测绘师 · 阵营 观星会 · 生日 1203'
const relations = '关系：沈砚（同门）、灰烬联邦（所属）\n标签：主角'
const oldRead = `# 林知遥（角色）\n${fieldsLine}\n${relations}\n\n正文：\n\n${body}`
const newRead = `${oldRead.slice(0, oldRead.indexOf(body))}${body.slice(0, 4000)}\n\n（正文已截断：共 ${body.length} 字；要看全文用 include_body: true。）`
const search = '匹配「林知遥」1 条：\n- [角色 #7] 林知遥（别名 遥 · 标签 主角）'
const oldWrite = `已写入 内置字段 race、occupation。现在这条是：\n\n${oldRead}`
const newWrite = [
  '已写入 内置字段 race、occupation。',
  '已写入 角色/林知遥.md',
  '改动：种族、职业',
  '版本：9f2c1a3（上一版 3a1d077）',
  '',
  '现在这条是：',
  '',
  '# 林知遥（角色）',
  fieldsLine,
  relations,
].join('\n')
const oldVerify = `# 林知遥（角色）\n${fieldsLine}\n${relations}\n\n正文：\n\n${body}`

const taskAOld = simulate(oldPrefix, [
  { text: '先查一下有没有同名。', tool: 'library_search', args: '{"query":"林知遥"}', result: search },
  { text: '读一下这条。', tool: 'library_read', args: '{"kind":"character","id":7}', result: oldRead },
  { text: '改种族和职业。', tool: 'library_set_fields', args: '{"kind":"character","id":7,"fields":{"race":"精灵","occupation":"观星人"}}', result: oldWrite },
  { text: '再读回来确认。', tool: 'library_read', args: '{"kind":"character","id":7}', result: oldVerify },
  { text: '改好了：种族=精灵，职业=观星人。' },
])
const taskANew = simulate(newPrefix, [
  { text: '先查一下有没有同名。', tool: 'library_search', args: '{"query":"林知遥"}', result: search },
  { text: '读一下这条。', tool: 'library_read', args: '{"kind":"character","id":7}', result: newRead },
  { text: '改种族和职业。', tool: 'library_set_fields', args: '{"kind":"character","id":7,"fields":{"race":"精灵","occupation":"观星人"}}', result: newWrite },
  { text: '改好了：种族=精灵，职业=观星人。' },
])

// ── 任务 B：查文件落点（dir + journal 大输出）──────────────────────────
const dirOut = '角色/林知遥.md\n国家/灰烬联邦.md\n'.repeat(857) // 约 18,000 字
const journalOut = `${JSON.stringify({ ts: 1, kind: 'update', actor: 'human', relPath: '角色/林知遥.md', keys: ['种族'], hash: 'abc' })}\n`.repeat(389) // 约 35,000 字
const listOut = '角色共列出 42 条（最近改动在前）：\n- [角色 #7] 林知遥\n- [角色 #8] 沈砚'
const taskBOld = simulate(oldPrefix, [
  { text: '先看盘上文件都在哪。', tool: 'run_shell', args: '{"command":"dir /s /b"}', result: dirOut },
  { text: '翻一下时间线。', tool: 'read_file', args: '{"path":".ocstudio/journal.jsonl"}', result: journalOut },
  { text: '列一下角色。', tool: 'library_list', args: '{"kind":"character"}', result: listOut },
  { text: '按现有目录写：角色/ 或国家/。' },
])
const taskBNew = simulate(newPrefix, [
  { text: '先看盘上文件都在哪。', tool: 'run_shell', args: '{"command":"dir /s /b"}', result: clipToolResult('run_shell', dirOut) },
  { text: '翻一下时间线。', tool: 'read_file', args: '{"path":".ocstudio/journal.jsonl"}', result: clipToolResult('read_file', journalOut) },
  { text: '列一下角色。', tool: 'library_list', args: '{"kind":"character"}', result: listOut },
  { text: '按现有目录写：角色/ 或国家/。' },
])

function pct(before: number, after: number): string {
  return `${((1 - after / before) * 100).toFixed(1)}%`
}

console.log('== 固定前缀（每次请求、每一步都重放）==')
console.log(`旧：${oldPrefix} tokens（工具 4,758 + 字段表 1,188 + 人格 295 + 环境/目录）`)
console.log(`新：${newPrefix} tokens（工具 + 能力卡片 + 人格 + 环境/目录）`)
console.log(`单次请求省 ${oldPrefix - newPrefix} tokens（${pct(oldPrefix, newPrefix)}）`)
console.log('')

for (const [name, oldRun, newRun] of [
  ['任务 A：查重 → 读长正文 → 改两个字段 → 旧版再读一遍', taskAOld, taskANew],
  ['任务 B：dir 18k + journal 35k 查落点', taskBOld, taskBNew],
] as const) {
  console.log(`== ${name} ==`)
  console.log(`旧：${oldRun.calls} 次调用，累计 prompt ${oldRun.promptTokens.toLocaleString()} tokens（每次 ${oldRun.perCall.join(' / ')}）`)
  console.log(`新：${newRun.calls} 次调用，累计 prompt ${newRun.promptTokens.toLocaleString()} tokens（每次 ${newRun.perCall.join(' / ')}）`)
  console.log(`省 ${(oldRun.promptTokens - newRun.promptTokens).toLocaleString()} tokens（${pct(oldRun.promptTokens, newRun.promptTokens)}）`)
  console.log('')
}

console.log('== 工具结果预算（单独看一次裁剪）==')
for (const [tool, text, newText] of [
  ['run_shell', dirOut, clipToolResult('run_shell', dirOut)],
  ['read_file', journalOut, clipToolResult('read_file', journalOut)],
  // library_read 的正文 4k 上限在 buildCodexSlice 里，不走 clipToolResult
  ['library_read', oldRead, newRead],
] as const) {
  console.log(
    `${tool}: ${text.length} → ${newText.length} 字符（≈${estimateTokens(text)} → ${estimateTokens(newText)} tokens，−${pct(estimateTokens(text), estimateTokens(newText))}）`,
  )
}

// ── 交叉验证：走真实 runAgentLoop（假模型 + 假工具），量发出去的 payload ──
interface LiveRun {
  calls: number
  total: number
  perCall: number[]
}

async function liveRun(userText: string, scripted: Array<{ name: string; args: string; result: string } | null>): Promise<LiveRun> {
  const systemText = [agentInstructions('zh'), env, LIBRARY_MODEL_MARKDOWN, catalog].join('\n\n')
  const payloads: Array<{ messages: unknown[]; tools: unknown[] }> = []
  let turn = 0
  const result = await runAgentLoop({
    history: [
      { role: 'system', content: systemText },
      { role: 'user', content: userText },
    ],
    tools: ALL_TOOLS,
    maxSteps: 8,
    signal: new AbortController().signal,
    buildBody: (messages, specs) => {
      // 深拷贝：loop 会原地继续 push，存引用会让每次量到的都是最后那份
      payloads.push({ messages: JSON.parse(JSON.stringify(messages)) as unknown[], tools: toOpenAiTools(specs) })
      return { messages } as never
    },
    stream: async (_body, _signal, onEvent) => {
      const step = scripted[turn++]
      if (step === null || step === undefined) {
        onEvent({ type: 'content', text: '完成。' })
        return
      }
      onEvent({
        type: 'toolCalls',
        deltas: [{ index: 0, id: `call-${turn}`, name: step.name, argumentsDelta: step.args }],
      })
    },
    approve: async () => 'allow',
    execute: async (call) => {
      const step = scripted.find((item) => item?.name === call.name)
      return { content: step?.result ?? 'ok', isError: false, durationMs: 0 }
    },
    onStepStart: () => undefined,
    onDelta: () => undefined,
    onToolUpdate: () => undefined,
  })
  const perCall = payloads.map(
    (payload) => estimateTokens(JSON.stringify(payload.messages)) + estimateTokens(JSON.stringify(payload.tools)),
  )
  return { calls: result.steps.length, total: perCall.reduce((sum, value) => sum + value, 0), perCall }
}

async function main(): Promise<void> {
const liveA = await liveRun('请改一下林知遥的种族和职业，改完告诉我。', [
  { name: 'library_search', args: '{"query":"林知遥"}', result: search },
  { name: 'library_read', args: '{"kind":"character","id":7}', result: newRead },
  {
    name: 'library_set_fields',
    args: '{"kind":"character","id":7,"fields":{"race":"精灵","occupation":"观星人"}}',
    result: newWrite,
  },
  null,
])
const liveB = await liveRun('这些条目文件到底落在哪个目录？', [
  { name: 'run_shell', args: '{"command":"dir /s /b"}', result: dirOut },
  { name: 'read_file', args: '{"path":".ocstudio/journal.jsonl"}', result: journalOut },
  { name: 'library_list', args: '{"kind":"character"}', result: listOut },
  null,
])

console.log('\n== 交叉验证：真实 runAgentLoop（新版，假模型 / 假工具）==')
console.log(
  `任务 A：${liveA.calls} 次调用，payload 累计 ${liveA.total.toLocaleString()} tokens（每次 ${liveA.perCall.join(' / ')}）` +
    `，与模拟 ${taskANew.promptTokens.toLocaleString()} 差 ${(((liveA.total - taskANew.promptTokens) / taskANew.promptTokens) * 100).toFixed(1)}%`,
)
console.log(
  `任务 B：${liveB.calls} 次调用，payload 累计 ${liveB.total.toLocaleString()} tokens（每次 ${liveB.perCall.join(' / ')}）` +
    `，与模拟 ${taskBNew.promptTokens.toLocaleString()} 差 ${(((liveB.total - taskBNew.promptTokens) / taskBNew.promptTokens) * 100).toFixed(1)}%`,
)
}

void main()


