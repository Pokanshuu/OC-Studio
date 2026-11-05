/**
 * 「这次改动是谁做的」—— `journal.jsonl` 的 `actor` 字段唯一来源
 * （`docs/Agent接入.md` §2.2）。
 *
 * 为什么要有作用域而不是每个调用点传参：写入是从**很多**地方发生的
 * （编辑器自动保存、标签改名回写、批量导入、回收站还原、助手改条目），
 * 让每个 service 一路把 `actor` 传下去，等于把它塞进几十个签名里，而且
 * 只要有一处忘了传，那条记录就会静默变成 `human` —— 留痕最怕这种沉默。
 * 改成一个作用域：谁发起就在外面包一层，中间所有写入自动带上身份。
 *
 * ⚠️ **时序约束**：`currentActor()` 在 `vault-persist` 的**入队那一刻**取值
 * （不是落盘那一刻），所以异步落盘、防抖、重试都不会把身份弄丢。反过来，
 * 同一个作用域里如果 `await` 了别的东西、而另一个作用域恰好在这期间开了，
 * 身份会串 —— 助手写库是「一次改一条」，不跨作用域并发，这条按现状成立。
 */
import type { JournalActor } from './journal'

/** 作用域栈：允许嵌套（助手调宿主能力，宿主内部又起一次显式身份） */
const stack: JournalActor[] = []

/** 当前身份；栈空 = 用户本人 */
export function currentActor(): JournalActor {
  return stack.length > 0 ? stack[stack.length - 1] : 'human'
}

function enter(actor: JournalActor): void {
  stack.push(actor)
}

function exit(): void {
  stack.pop()
}

/** 同步作用域 */
export function runAsActor<T>(actor: JournalActor, run: () => T): T {
  enter(actor)
  try {
    return run()
  } finally {
    exit()
  }
}

/** 异步作用域：`await` 全程都算这个身份 */
export async function runAsActorAsync<T>(actor: JournalActor, run: () => Promise<T>): Promise<T> {
  enter(actor)
  try {
    return await run()
  } finally {
    exit()
  }
}

/** 只读观察用（创作时间线按身份过滤 / 上色） */
export function isAgentActor(actor: JournalActor): boolean {
  return actor.startsWith('agent:') || actor.startsWith('plugin:')
}
