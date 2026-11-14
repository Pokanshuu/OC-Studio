/**
 * 「实体 → 落盘文件」身份的查询器（导入 / 落盘 / 导出三处共用）。
 *
 * 为什么单独一个模块：正文里的 `[[ ]]` 在磁盘上是**按文件解析**的（Obsidian 只认
 * 文件名 / 别名），而库里存的是 id。写正文时必须先把 id 换成**目标实际会落在哪个
 * 文件**，否则同名条目（`同名角色.md` 与 `同名角色 (2).md`）会解析到另一条上
 * （审查报告 Q02）。
 *
 * 因此「生成正文」之前必须先有路径：本模块只做 id → 路径的登记与取基名，
 * 具体谁在什么时候登记由调用方决定：
 * - 导出物化（`export-dir.ts`）：先规划完全部路径，再序列化正文；
 * - 落盘队列（`vault-persist.ts`）：计划阶段 `allocateRelPath` 后立即登记，
 *   正文序列化时即可取到本批新条目的路径（接口需求见 `tmp/repair-orchestration/C2-result.md`）。
 */

import type { VaultEntityKind } from './types'

/** 实体在路径登记表里的键：表 + id 分开，避免不同表的同号 id 串号 */
export function entityPathKey(kind: VaultEntityKind, id: number): string {
  return `${kind}:${id}`
}

/** vault 相对路径 → 文件名基名（去掉目录与 `.md`）；空路径返回 undefined */
export function fileBaseOfRelPath(relPath: string | undefined): string | undefined {
  if (relPath === undefined) return undefined
  const normalized = relPath.replace(/\\/g, '/')
  const name = normalized.slice(normalized.lastIndexOf('/') + 1).replace(/\.md$/i, '')
  return name === '' ? undefined : name
}

export interface EntityPathIndex {
  /** 登记某条实体的落盘路径（跳过 / 覆盖 / 新建都要登记） */
  set(kind: VaultEntityKind, id: number, relPath: string | undefined): void
  /** 目标实体的文件名（去 `.md`）；没登记返回 undefined */
  fileBaseOf(kind: VaultEntityKind, id: number): string | undefined
  /** 目标实体登记过的路径；没登记返回 undefined */
  relPathOf(kind: VaultEntityKind, id: number): string | undefined
}

/** 新建一份登记表（导出物化 / 落盘计划各自持有一份，互不影响） */
export function createEntityPathIndex(
  /**
   * 自定义键函数：落盘队列里实体的键是 `entityKey(表名, id)`（`characters:12`），
   * 与这里的 `kind:id`（`character:12`）不是一套写法 —— 接线时传一个适配器即可。
   */
  keyOf: (kind: VaultEntityKind, id: number) => string = entityPathKey,
): EntityPathIndex {
  const paths = new Map<string, string>()
  return {
    set(kind, id, relPath) {
      if (relPath === undefined || relPath === '') return
      paths.set(keyOf(kind, id), relPath)
    },
    fileBaseOf(kind, id) {
      return fileBaseOfRelPath(paths.get(keyOf(kind, id)))
    },
    relPathOf(kind, id) {
      return paths.get(keyOf(kind, id))
    },
  }
}
