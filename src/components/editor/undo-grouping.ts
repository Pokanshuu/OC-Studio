/**
 * 撤销粒度 —— 让 Ctrl+Z 退的是「一件事」，不是「恰好几百毫秒内发生的事」。
 *
 * ProseMirror 的 history 默认按时间分组（`newGroupDelay`，停一下再打字就断一步）。
 * 但结构操作（插图 / 表格 / 标题 / 列表 / 粘贴 / `@` 提及）和时间无关：它们必须
 * 自己占一步，否则「打一段字 → 插一张图 → 继续打字」会变成一步，撤销时图和文字
 * 一起消失。
 *
 * 做法：包一层 `view.dispatch`。事务里出现结构变化时，先在**前**关一次组、应用事务、
 * 再在**后**关一次组 —— 前后都断开，它就不可能和邻近输入粘在一起。
 * 连续打字仍是普通事务，交给 history 自己按时间合并。
 *
 * 批量场景（一次粘贴多张图、Markdown 转结构）用 `beginHistoryBatch()` 暂停自动隔离，
 * 整个批次只算一步。
 */

import type { Editor } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { ReplaceAroundStep, ReplaceStep } from '@tiptap/pm/transform'

/**
 * 出现这些节点 / 块类型，就认为这一步是「结构性操作」。
 * 段落与文本**不在此列**：连续打字、回车换段都应该和前后文合成一组。
 */
const STRUCTURAL_NODE_TYPES = new Set([
  'imageBlock',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
  'horizontalRule',
  'codeBlock',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'blockquote',
  'heading',
  'mention',
])

let batchDepth = 0

/** 暂停自动隔离，返回结束函数（结束时会恢复；重复调用无副作用） */
export function beginHistoryBatch(): () => void {
  batchDepth += 1
  let finished = false
  return () => {
    if (finished) return
    finished = true
    batchDepth = Math.max(0, batchDepth - 1)
  }
}

/** 手动关一次撤销组：下一笔输入不再并入上一组 */
export function closeUndoGroup(editor: Editor): void {
  editor.view.dispatch(closeHistory(editor.state.tr))
}

/** 把一段操作收成单独一步（前后都断开） */
export function runAsSingleUndoStep(editor: Editor, run: () => void): void {
  closeUndoGroup(editor)
  const end = beginHistoryBatch()
  try {
    run()
  } finally {
    end()
    closeUndoGroup(editor)
  }
}

/** 事务里有没有结构性变化（导出给单测 / 调试用） */
export function isStructuralTransaction(tr: {
  steps: ReadonlyArray<unknown>
}): boolean {
  for (const raw of tr.steps) {
    // 块类型切换（标题 / 列表 / 引用）都是 ReplaceAroundStep
    if (raw instanceof ReplaceAroundStep) return true
    if (!(raw instanceof ReplaceStep)) continue
    // 纯删除（空 slice）：选中的内容整段被删掉，单独成一步
    if (raw.slice.content.size === 0) {
      if (raw.from !== raw.to) return true
      continue
    }
    let structural = false
    raw.slice.content.forEach((node) => {
      if (structural) return
      // 原子块（图片 / 分割线）自己是结构节点，`descendants` 不会访问自身
      if (STRUCTURAL_NODE_TYPES.has(node.type.name)) {
        structural = true
        return
      }
      node.descendants((child) => {
        if (STRUCTURAL_NODE_TYPES.has(child.type.name)) structural = true
        return !structural
      })
    })
    if (structural) return true
  }
  return false
}

/**
 * 装上撤销分组；返回卸载函数。
 *
 * 只包 `view.dispatch`，不碰命令实现 —— 工具栏、斜杠菜单、粘贴、拖拽都从这一个口
 * 进事务，所以不用在每个调用点补 `closeHistory`。
 */
export function installUndoGrouping(editor: Editor): () => void {
  const view = editor.view
  const original = view.dispatch.bind(view)
  let inside = false

  const dispatch: typeof view.dispatch = (tr) => {
    if (inside || batchDepth > 0 || !tr.docChanged || !isStructuralTransaction(tr)) {
      original(tr)
      return
    }
    inside = true
    try {
      original(closeHistory(editor.state.tr))
      original(tr)
      original(closeHistory(editor.state.tr))
    } finally {
      inside = false
    }
  }

  view.dispatch = dispatch
  return () => {
    if (view.dispatch === dispatch) view.dispatch = original
  }
}
