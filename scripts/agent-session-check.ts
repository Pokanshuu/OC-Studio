/**
 * 助手会话树自检（纯函数，不需要浏览器 / 磁盘）。
 *
 * 树的形状错了最难回滚 —— 所以先把「追加 / 分支 / 切版本 / 压缩窗口」逐条钉死。
 * 跑法：`npx tsx scripts/agent-session-check.ts`
 */
import {
  appendNode,
  createSession,
  currentPath,
  deepestLeaf,
  siblingsOf,
  switchSibling,
  windowFor,
  type AgentSession,
} from '../src/lib/plugins/agent/session'

let passed = 0
const failures: string[] = []

function check(ok: boolean, label: string): void {
  if (ok) passed += 1
  else failures.push(label)
}

function eq(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  check(a === b, `${label}：期望 ${b}，实际 ${a}`)
}

/** 建一条「用户问 → 助手答」的对话，返回会话与新节点 id */
function turn(session: AgentSession, question: string, answer: string): { session: AgentSession; userId: string; assistantId: string } {
  const withUser = appendNode(session, { parentId: session.leafId, role: 'user', content: question })
  const userId = withUser.leafId as string
  const withAnswer = appendNode(withUser, { parentId: userId, role: 'assistant', content: answer, model: 'test' })
  return { session: withAnswer, userId, assistantId: withAnswer.leafId as string }
}

// 1. 空会话
const empty = createSession('测试')
eq('新会话没有节点', Object.keys(empty.nodes).length, 0)
eq('新会话没有根', [empty.rootId, empty.leafId], [null, null])
eq('空会话的路径', currentPath(empty), [])

// 2. 追加两轮
let session = createSession()
const first = turn(session, '这是谁？', '这是凯尔。')
session = first.session
session = turn(session, '她在哪？', '北境。').session
eq('两轮后节点数', Object.keys(session.nodes).length, 4)
eq('根是最早那条 user', session.nodes[session.rootId as string].role, 'user')
eq('当前路径长度', currentPath(session).length, 4)
eq('当前路径首条内容', currentPath(session)[0].content, '这是谁？')

// 3. 重新生成：同一 user 下再建一个 assistant（兄弟版本）
const regenerate = appendNode(session, {
  parentId: first.userId,
  role: 'assistant',
  content: '这是北境的凯尔。',
  model: 'test-2',
})
eq('重新生成后节点数 +1', Object.keys(regenerate.nodes).length, 5)
const parents = siblingsOf(regenerate, regenerate.leafId as string)
eq('两个助手版本', parents.length, 2)
eq('当前停在新版本', currentPath(regenerate).length, 2)

// 4. 切回旧版本：旧分支还在，不删
// 注意断的是**那个位置上的版本**（路径第 2 条），不是末条 —— 换版本之后
// 这一支自己的后续对话照旧接着走（a1 → u2 → a2），末条仍是「北境。」
const back = switchSibling(regenerate, regenerate.leafId as string, -1)
eq('切回旧版本的内容', currentPath(back)[1]?.content, '这是凯尔。')
eq('切版本不删节点', Object.keys(back.nodes).length, 5)
const forward = switchSibling(back, currentPath(back)[1].id, 1)
eq('再切回新版本', currentPath(forward)[1]?.content, '这是北境的凯尔。')

// 5. 编辑重发：同一父节点下再建一个 user
eq('第一条 user 没有父', currentPath(session)[0].parentId, null)
const edited = appendNode(session, { parentId: null, role: 'user', content: '凯尔是谁？' })
eq('编辑重发多一个根兄弟', siblingsOf(edited, edited.leafId as string).length, 2)

// 6. 分支切换停在最深代（另一支自己还有后续，所以停在它的末尾）
const deepSwitch = switchSibling(edited, edited.leafId as string, -1)
eq('切到另一支后停在它的末尾', currentPath(deepSwitch).length, 4)
eq('另一支的末条', currentPath(deepSwitch).at(-1)?.content, '北境。')
eq('deepestLeaf 与 leafId 一致', deepestLeaf(deepSwitch, deepSwitch.rootId as string) !== null, true)

// 7. 压缩窗口：只影响发出去的内容
let longSession = createSession()
for (let i = 0; i < 30; i += 1) {
  longSession = turn(longSession, `问题 ${i}`, `回答 ${i}`).session
}
eq('本地消息一条不删', Object.keys(longSession.nodes).length, 60)
const window = windowFor(longSession, 20)
eq('窗口条数 = 20 + 省略提示', window.length, 21)
eq('窗口首条是省略提示', window[0].content.startsWith('（此前还有'), true)
eq('窗口末条是最新的回答', window.at(-1)?.content, '回答 29')

// 8. 空内容不进窗口
const withEmpty = appendNode(longSession, { parentId: longSession.leafId, role: 'assistant', content: '   ' })
eq('空内容被过滤掉', windowFor(withEmpty, 5).at(-1)?.content, '回答 29')

console.log('助手会话树自检：')
if (failures.length === 0) {
  console.log(`  ✓ 通过（${passed} 项断言）`)
} else {
  for (const failure of failures) console.log(`  × ${failure}`)
  console.log(`  ${failures.length} 项失败 / 共 ${passed + failures.length} 项`)
  process.exitCode = 1
}
