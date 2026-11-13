import { describe, expect, it } from 'vitest'
import type { Editor } from '@tiptap/core'
import { Schema } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import type { Transaction } from '@tiptap/pm/state'
import { beginHistoryBatch, installUndoGrouping, isStructuralTransaction } from '@/components/editor/undo-grouping'

/**
 * 撤销分组只看事务里的步骤类型：这里用最小 schema 造事务，不启动编辑器。
 * 规则本身在 `undo-grouping.ts`，名字与 `STRUCTURAL_NODE_TYPES` 对齐。
 */
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
    imageBlock: { group: 'block', atom: true, attrs: { src: {} } },
    heading: { content: 'inline*', group: 'block', attrs: { level: { default: 1 } } },
  },
  marks: {},
})

function baseState() {
  return EditorState.create({
    schema,
    doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('hello')])]),
  })
}

describe('isStructuralTransaction', () => {
  it('连续打字不算结构变化（仍按时间合并）', () => {
    expect(isStructuralTransaction(baseState().tr.insertText('x', 1))).toBe(false)
  })

  it('回车换段不算结构变化', () => {
    const tr = baseState().tr.insert(1, schema.node('paragraph', null, [schema.text('new')]))
    expect(isStructuralTransaction(tr)).toBe(false)
  })

  it('插入图片块算，且能识别原子节点自身', () => {
    const tr = baseState().tr.insert(1, schema.node('imageBlock', { src: 'a.png' }))
    expect(isStructuralTransaction(tr)).toBe(true)
  })

  it('切换标题（ReplaceAroundStep）算', () => {
    const tr = baseState().tr.setBlockType(0, 7, schema.nodes.heading, { level: 2 })
    expect(isStructuralTransaction(tr)).toBe(true)
  })

  it('删除选中内容算', () => {
    const tr = baseState().tr.delete(1, 6)
    expect(isStructuralTransaction(tr)).toBe(true)
  })

  it('空事务不算', () => {
    expect(isStructuralTransaction(baseState().tr)).toBe(false)
  })
})

/** 只实现 dispatch 的假 view：应用事务并记录，够验证「前后各关一次组」的顺序 */
function fakeEditor() {
  let state = baseState()
  const dispatched: Transaction[] = []
  const view = {
    get state() {
      return state
    },
    dispatch(tr: Transaction) {
      dispatched.push(tr)
      state = state.apply(tr)
    },
  }
  const editor = {
    get state() {
      return state
    },
    view,
  } as unknown as Editor
  return {
    editor,
    dispatched,
    dispatch: (tr: Transaction) => view.dispatch(tr),
  }
}

describe('installUndoGrouping', () => {
  it('结构事务：关组 → 应用 → 再关组', () => {
    const fake = fakeEditor()
    const uninstall = installUndoGrouping(fake.editor)
    fake.dispatch(fake.editor.state.tr.insert(1, schema.node('imageBlock', { src: 'a.png' })))
    expect(fake.dispatched.map((tr) => tr.steps.length)).toEqual([0, 1, 0])
    uninstall()
  })

  it('打字事务原样放行，不额外插空事务', () => {
    const fake = fakeEditor()
    const uninstall = installUndoGrouping(fake.editor)
    fake.dispatch(fake.editor.state.tr.insertText('x', 1))
    expect(fake.dispatched).toHaveLength(1)
    uninstall()
  })

  it('批量模式里各自成步的结构操作不插空事务', () => {
    const fake = fakeEditor()
    const uninstall = installUndoGrouping(fake.editor)
    const end = beginHistoryBatch()
    fake.dispatch(fake.editor.state.tr.insert(1, schema.node('imageBlock', { src: 'a.png' })))
    end()
    fake.dispatch(fake.editor.state.tr.insert(1, schema.node('imageBlock', { src: 'b.png' })))
    expect(fake.dispatched.map((tr) => tr.steps.length)).toEqual([1, 0, 1, 0])
    uninstall()
  })

  it('卸载后不再插入空事务', () => {
    const fake = fakeEditor()
    const uninstall = installUndoGrouping(fake.editor)
    uninstall()
    fake.dispatch(fake.editor.state.tr.insert(1, schema.node('imageBlock', { src: 'a.png' })))
    expect(fake.dispatched).toHaveLength(1)
  })
})
