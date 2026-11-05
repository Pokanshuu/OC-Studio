/**
 * 身份留痕自检：`npx tsx scripts/journal-actor-check.ts`
 *
 * 验两件事：**作用域**（`lib/vault/actor.ts`）和**落款**（`journal.jsonl` 的
 * `actor` 字段能不能原样读回来）。中间那段「入队时抓身份」在
 * `vault-persist` 里，靠类型保证（`PendingWrite.actor` 不可省），这里不重复测。
 */
import { currentActor, isAgentActor, runAsActor, runAsActorAsync } from '../src/lib/vault/actor'
import { normalizeActor, parseJournalLine, type JournalActor } from '../src/lib/vault/journal'

let passed = 0
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1
    return
  }
  console.error(`  FAIL ${name}${detail ? `：${detail}` : ''}`)
  process.exitCode = 1
}

function journalLine(actor: unknown): string {
  return JSON.stringify({
    ts: 1_700_000_000_000,
    kind: 'update',
    actor,
    relPath: '角色/林知遥.md',
    title: '林知遥',
    keys: ['阵营'],
    hash: 'aaa',
    prevHash: 'bbb',
  })
}

async function main(): Promise<void> {
  // ── 作用域 ────────────────────────────────────────────────────────────
  check('栈空时算用户本人', currentActor() === 'human')

  const inside = runAsActor('agent:assistant', () => currentActor())
  check('同步作用域内是助手', inside === 'agent:assistant')
  check('同步作用域退出后复原', currentActor() === 'human')

  const nested = runAsActor('agent:assistant', () =>
    runAsActor('plugin:official.map-generator', () => currentActor()),
  )
  check('嵌套时内层优先', nested === 'plugin:official.map-generator')
  check('嵌套退出后仍复原', currentActor() === 'human')

  try {
    runAsActor('agent:assistant', () => {
      throw new Error('boom')
    })
  } catch {
    // 故意抛
  }
  check('作用域抛异常也不漏身份', currentActor() === 'human')

  const asyncSeen = await runAsActorAsync('agent:assistant', async () => {
    await Promise.resolve()
    return currentActor()
  })
  check('异步作用域跨 await 仍生效', asyncSeen === 'agent:assistant')
  check('异步作用域退出后复原', currentActor() === 'human')

  try {
    await runAsActorAsync('agent:assistant', async () => {
      await Promise.resolve()
      throw new Error('boom')
    })
  } catch {
    // 故意抛
  }
  check('异步作用域抛异常也不漏身份', currentActor() === 'human')

  // ── 身份分类 ──────────────────────────────────────────────────────────
  const actors: JournalActor[] = ['human', 'agent:assistant', 'plugin:official.map-generator']
  check('human 不算机器', !isAgentActor('human'))
  check('agent: 算机器', isAgentActor('agent:assistant'))
  check('plugin: 算机器', isAgentActor('plugin:official.map-generator'))
  check('三种身份都不算空', actors.every((actor) => actor.length > 0))

  // ── 落款能读回来 ──────────────────────────────────────────────────────
  const agentEntry = parseJournalLine(journalLine('agent:assistant'))
  check('时间线保留助手身份', agentEntry?.actor === 'agent:assistant', String(agentEntry?.actor))
  check('时间线保留其余字段', agentEntry?.relPath === '角色/林知遥.md' && agentEntry?.kind === 'update')

  const pluginEntry = parseJournalLine(journalLine('plugin:official.map-generator'))
  check('时间线保留插件身份', pluginEntry?.actor === 'plugin:official.map-generator')

  const humanEntry = parseJournalLine(journalLine(undefined))
  check('缺 actor 的一律按 human', humanEntry?.actor === 'human')

  check('非法身份收敛成 human', normalizeActor('gpt') === 'human')
  check('human 原样保留', normalizeActor('human') === 'human')

  console.log(`身份留痕自检：${passed} 项断言通过`)
}

void main()
