/**
 * 助手读库的**唯一入口**（进程内直调 `lib/capabilities`，不走 MCP）。
 *
 * 取舍：这一版先做「把库讲给模型听」——开场给一段只读概览，让它知道有谁、有多少、
 * 大类怎么分；真正的工具循环（模型自己决定调 list / search / graphSlice）下一步做。
 * 好处是：**只读、无副作用、不新增写路径**，先把「有机构成」验证掉。
 *
 * 权限：调用方固定是 `agent:assistant` + 只读级。界面上关掉「读实体」授权后，
 * 这里直接返回空串，不抛错 —— 助手照常能聊，只是看不见库。
 */
import { createCapabilities } from '@/lib/capabilities'
import { createDexieCapabilityStore } from '@/lib/capabilities/dexie-store'
import { READ_PERMISSION, type Caller, type EntityKind } from '@/lib/capabilities/types'

const CALLER: Caller = { actor: 'agent:assistant', permissions: READ_PERMISSION }

const KIND_LABEL: Record<EntityKind, string> = {
  character: '角色',
  event: '事件',
  country: '国家',
  world: '词条',
}

const KINDS: EntityKind[] = ['character', 'event', 'country', 'world']

/** 每类的取样上限：概览只要「知道有什么」，不需要整库 */
const SAMPLE = 40

/**
 * 库概览（给 system 消息用）。
 *
 * 输出刻意短：标题按行铺，超过取样数只说「等 N 项」。模型不需要全量清单 ——
 * 全量既费 token，又会诱导它「照着清单编」。
 */
export async function buildLibraryContext(): Promise<string> {
  try {
    const capabilities = createCapabilities(createDexieCapabilityStore())
    const lines: string[] = []
    let total = 0

    for (const kind of KINDS) {
      const items = await capabilities.listEntities(CALLER, kind, SAMPLE)
      total += items.length
      if (items.length === 0) continue
      const titles = items.map((item) => item.title).filter((title) => title.trim() !== '')
      if (titles.length === 0) continue
      const more = items.length >= SAMPLE ? `（另有更多）` : ''
      lines.push(`${KIND_LABEL[kind]} ${items.length} 项${more}：${titles.join('、')}`)
    }

    if (total === 0) return ''
    return [
      '你在一个本地世界观笔记库里工作。以下是库里的内容概览（只读）：',
      ...lines,
      '回答时只依据这份概览与用户提供的信息；不确定就说不知道，不要编造条目。',
    ].join('\n')
  } catch (err) {
    console.warn('[agent] 读取库概览失败', err)
    return ''
  }
}
