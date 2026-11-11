/**
 * 正文里的引用节点（`mention` / `wikiLink`）**按类型改显示名**的纯逻辑。
 *
 * 为什么单独一个文件：这里是「改名后回写引用」的唯一口径，且必须能脱离 Dexie 被自检覆盖。
 * `reference-sync.ts` 负责查库（谁引用了谁），这里只负责在一个文档对象上动手。
 *
 * 事故形状（2026-11-12 复现）：改名用的是「id → 新名字」的**单键**映射，
 * 不看类型 —— 角色 1 改名，会把正文里指向**笔记 1** 的 `[[链接]]` 也改名。
 * 用户看到的是「改了个角色名，某个词条正文里的链接文字跟着变了」。
 * id 在不同表里各自从 1 开始，所以映射键必须是 `类型:id`。
 */

export type DocNode = {
  type?: string
  attrs?: Record<string, unknown>
  content?: DocNode[]
  text?: string
  [key: string]: unknown
}

export interface RefInfo {
  id: string
  entityType: string
}

/** 引用节点 → 它指向的类型（`wikiLink` 永远指笔记；`mention` 看 attrs.entityType） */
export function refTypeOf(node: DocNode): string | null {
  if (node.type === 'wikiLink') return 'world'
  if (node.type === 'mention') return String(node.attrs?.entityType ?? '')
  return null
}

/** 映射键：`类型:id`。**不要退回成只用 id**，见文件头。 */
export function refKey(entityType: string, id: string | number): string {
  return `${entityType}:${String(id)}`
}

/** 收集文档里所有引用 */
export function collectRefs(node: DocNode): RefInfo[] {
  const refs: RefInfo[] = []

  function walk(n: DocNode) {
    if (!n || typeof n !== 'object') return
    const entityType = refTypeOf(n)
    if (entityType !== null && n.attrs?.id) {
      refs.push({ id: String(n.attrs.id), entityType })
    }
    if (Array.isArray(n.content)) {
      for (const child of n.content) walk(child)
    }
  }

  walk(node)
  return refs
}

/** 文档里有没有「指向这个类型 + id」的引用 */
export function hasRef(doc: unknown, entityType: string, entityId: string | number): boolean {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false
  const want = refKey(entityType, entityId)
  return collectRefs(doc as DocNode).some((ref) => refKey(ref.entityType, ref.id) === want)
}

/** 按 `类型:id → 新名字` 的映射改显示名；没有变化返回原对象（调用方据此跳过写入） */
export function retitleRefs(doc: DocNode, names: ReadonlyMap<string, string>): DocNode {
  const entityType = refTypeOf(doc)

  let updated = doc
  if (entityType !== null && doc.attrs?.id) {
    const nextName = names.get(refKey(entityType, String(doc.attrs.id)))
    if (nextName !== undefined && nextName !== '' && doc.attrs.label !== nextName) {
      updated = { ...doc, attrs: { ...doc.attrs, label: nextName } }
    }
  }

  if (Array.isArray(doc.content)) {
    let contentChanged = false
    const nextContent = doc.content.map((child) => {
      const result = retitleRefs(child, names)
      if (result !== child) contentChanged = true
      return result
    })
    if (contentChanged) updated = { ...updated, content: nextContent }
  }

  return updated
}

/** 单个实体改名的便捷入口：返回新文档，没变化返回 null */
export function retitleOneRef(
  doc: unknown,
  entityType: string,
  entityId: string | number,
  newName: string,
): Record<string, unknown> | null {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null
  const updated = retitleRefs(doc as DocNode, new Map([[refKey(entityType, entityId), newName]]))
  if (updated === doc) return null
  return updated as Record<string, unknown>
}
