/**
 * 往普通输入框（`input` / `textarea`）里插入文本，并让 React 知道值变了。
 *
 * 为什么不能直接 `element.value = next`：React 在受控组件上装了一个「值追踪器」，
 * 直接改 DOM 值之后它的追踪器还认为值没变，随后的 `input` 事件会被丢掉 ——
 * 表现就是「粘贴进去了，但下一帧又被 state 覆盖回去」。
 *
 * 正确做法（各编辑器库的通行写法）：走**原型链上的原生 setter** 写值，
 * 再派发一个冒泡的 `input` 事件。React 的 `onChange` 与 `useState` 会正常跟上。
 */

type TextField = HTMLInputElement | HTMLTextAreaElement

/** 是不是可插入文本的输入框（不含 contenteditable，那条走编辑器自己的管线） */
export function isTextField(element: Element | null): element is TextField {
  if (element === null) return false
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
}

function nativeValueSetter(element: TextField): ((value: string) => void) | null {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (!setter) return null
  return (value: string) => setter.call(element, value)
}

/**
 * 在光标处（或替换选中内容）插入 `text`，光标落到插入内容之后。
 * 返回插入后的值；输入框被禁用 / 只读时返回 `null`。
 */
export function insertIntoInput(element: TextField, text: string): string | null {
  if (element.disabled || element.readOnly) return null

  const start = element.selectionStart ?? element.value.length
  const end = element.selectionEnd ?? start
  const next = `${element.value.slice(0, start)}${text}${element.value.slice(end)}`

  const setter = nativeValueSetter(element)
  if (setter) setter(next)
  else element.value = next

  const caret = start + text.length
  try {
    element.setSelectionRange(caret, caret)
  } catch {
    // 某些 input type（email / number）不支持 setSelectionRange —— 值已经写进去了
  }

  element.dispatchEvent(new Event('input', { bubbles: true }))
  return next
}

/** 全选一个输入框的内容（与编辑器里的「全选」对应） */
export function selectAllInInput(element: TextField): void {
  element.focus()
  element.select()
}
