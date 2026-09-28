import { NON_TEXT_INPUT_TYPES } from './constants'

// ── 可编辑元素判定 ──

export function isEditable(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.includes(el.type)
  }
  return el instanceof HTMLTextAreaElement || el.isContentEditable
}

export function isNativeInput(el: HTMLElement): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
}

export function clamp(v: number, min: number, max: number) { return Math.min(Math.max(v, min), max) }

// ── 锚点测量（工具栏定位） ──

export type AnchorRect = { x: number; y: number; h: number }

function inputAnchorRect(el: HTMLInputElement): AnchorRect {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top, h: r.height }
}

function textareaAnchorRect(el: HTMLTextAreaElement): AnchorRect | null {
  const pos = el.selectionStart
  if (pos === null) return null
  const cs = getComputedStyle(el)
  const rect = el.getBoundingClientRect()
  const mirror = document.createElement('div')
  const s = mirror.style
  s.position = 'fixed'
  s.top = `${rect.top}px`
  s.left = `${rect.left}px`
  s.width = `${rect.width}px`
  s.font = cs.font
  s.lineHeight = cs.lineHeight
  s.letterSpacing = cs.letterSpacing
  s.whiteSpace = 'pre-wrap'
  s.overflowWrap = 'break-word'
  s.paddingTop = cs.paddingTop
  s.paddingLeft = cs.paddingLeft
  s.paddingRight = cs.paddingRight
  s.borderTopWidth = cs.borderTopWidth
  s.borderLeftWidth = cs.borderLeftWidth
  s.visibility = 'hidden'
  s.pointerEvents = 'none'
  mirror.textContent = el.value.substring(0, pos)
  const marker = document.createElement('span')
  marker.textContent = '|'
  mirror.appendChild(marker)
  document.body.appendChild(mirror)
  const markerRect = marker.getBoundingClientRect()
  const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2
  document.body.removeChild(mirror)
  return { x: markerRect.left + markerRect.width / 2, y: markerRect.top - el.scrollTop, h: lineH }
}

function proseMirrorAnchorRect(): AnchorRect | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  if (sel.isCollapsed) {
    try {
      // Insert a temporary zero-width span to measure caret position
      if (sel.focusNode instanceof Text) {
        const span = document.createElement('span')
        span.textContent = '​'
        const range = new Range()
        range.setStart(sel.focusNode, sel.focusOffset)
        range.insertNode(span)
        const rect = span.getBoundingClientRect()
        const lineH = rect.height || parseFloat(getComputedStyle(span).fontSize) * 1.2 || 16
        span.parentNode?.removeChild(span)
        sel.focusNode.parentNode?.normalize()
        if (rect.width === 0 && rect.height === 0) return null
        return { x: rect.left + rect.width / 2, y: rect.top, h: lineH }
      }
      // focusNode is an Element (e.g., empty paragraph <p><br></p>)
      if (sel.focusNode instanceof HTMLElement) {
        const span = document.createElement('span')
        span.textContent = '​'
        const range = new Range()
        range.setStart(sel.focusNode, sel.focusOffset)
        range.collapse(true)
        range.insertNode(span)
        const rect = span.getBoundingClientRect()
        const lineH = rect.height || parseFloat(getComputedStyle(span).fontSize) * 1.2 || 16
        span.parentNode?.removeChild(span)
        sel.focusNode.normalize()
        if (rect.width === 0 && rect.height === 0) return null
        return { x: rect.left + rect.width / 2, y: rect.top, h: lineH }
      }
    } catch { return null }
  }
  const range = sel.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    // Fallback: use getClientRects for multi-line selections
    const rects = range.getClientRects()
    if (rects.length > 0) {
      const first = rects[0]
      return { x: first.left + first.width / 2, y: first.top, h: first.height }
    }
    return null
  }
  return { x: rect.left + rect.width / 2, y: rect.top, h: rect.height }
}

export function getAnchorRect(el: HTMLElement): AnchorRect | null {
  if (el instanceof HTMLInputElement) return inputAnchorRect(el)
  if (el instanceof HTMLTextAreaElement) return textareaAnchorRect(el)
  if (el.isContentEditable) return proseMirrorAnchorRect()
  return null
}

// ── 当前可编辑元素解析 ──

export function getActiveEditable(): HTMLElement | null {
  const el = document.activeElement as HTMLElement | null
  if (!el || !isEditable(el)) return null
  return el
}

export function findEditableFromSelection(): HTMLElement | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  let node: Node | null = sel.anchorNode
  while (node) {
    if (node instanceof HTMLElement && isEditable(node)) return node
    node = node.parentElement
  }
  return null
}

export function resolveEditable(): HTMLElement | null {
  return getActiveEditable() ?? findEditableFromSelection()
}

export function isCollapsed(el: HTMLElement | null): boolean {
  if (!el) return true
  if (isNativeInput(el)) return (el as HTMLInputElement).selectionStart === (el as HTMLInputElement).selectionEnd
  const sel = window.getSelection()
  return !sel || sel.isCollapsed
}

export function isEditorDom(el: HTMLElement | null, editorDom: HTMLElement | undefined): boolean {
  if (!el || !editorDom) return false
  return el === editorDom || editorDom.contains(el)
}
