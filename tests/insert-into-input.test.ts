import { describe, expect, it } from 'vitest'
import { insertIntoInput, isTextField, selectAllInInput } from '@/lib/insert-into-input'

/**
 * 「编辑菜单的粘贴」在焦点位于普通输入框时走这里。
 *
 * 关键是**写完要派发 input 事件**：不派发的话 React 的 state 不知道值变了，
 * 下一次受控渲染会把粘贴进去的字覆盖回去（用户看到的是「粘贴没反应」）。
 */
describe('insert-into-input', () => {
  it('在光标处插入并让光标落在插入内容之后', () => {
    const input = document.createElement('input')
    input.value = 'abcd'
    input.setSelectionRange(2, 2)
    let fired = 0
    input.addEventListener('input', () => { fired += 1 })

    const next = insertIntoInput(input, 'XY')

    expect(next).toBe('abXYcd')
    expect(input.value).toBe('abXYcd')
    expect(input.selectionStart).toBe(4)
    expect(fired).toBe(1)
  })

  it('替换选中的内容', () => {
    const textarea = document.createElement('textarea')
    textarea.value = 'hello world'
    textarea.setSelectionRange(6, 11)

    expect(insertIntoInput(textarea, 'there')).toBe('hello there')
    expect(textarea.value).toBe('hello there')
  })

  it('空值上插入', () => {
    const input = document.createElement('input')
    expect(insertIntoInput(input, '新的')).toBe('新的')
    expect(input.value).toBe('新的')
  })

  it('只读 / 禁用时不动', () => {
    const input = document.createElement('input')
    input.value = 'x'
    input.readOnly = true
    expect(insertIntoInput(input, 'y')).toBeNull()
    expect(input.value).toBe('x')

    const disabled = document.createElement('textarea')
    disabled.value = 'x'
    disabled.disabled = true
    expect(insertIntoInput(disabled, 'y')).toBeNull()
  })

  it('isTextField 只认 input / textarea', () => {
    expect(isTextField(document.createElement('input'))).toBe(true)
    expect(isTextField(document.createElement('textarea'))).toBe(true)
    expect(isTextField(document.createElement('div'))).toBe(false)
    expect(isTextField(null)).toBe(false)
  })

  it('selectAllInInput 选中全部内容', () => {
    const input = document.createElement('input')
    input.value = 'abcdef'
    selectAllInInput(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(6)
  })
})
