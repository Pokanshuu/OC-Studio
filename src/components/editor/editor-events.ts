import type { Editor } from '@tiptap/core'

/** 工具栏「查找替换」→ EditorCore 的查找浮条。事件带 editor 实例，多编辑器时只开对应那个。 */
export const OPEN_FIND_EVENT = 'oc-editor:open-find'

export interface OpenFindEventDetail {
  editor: Editor
}

export function requestFind(editor: Editor): void {
  window.dispatchEvent(new CustomEvent<OpenFindEventDetail>(OPEN_FIND_EVENT, { detail: { editor } }))
}

/** 工具栏「大纲」→ EditorCore 的大纲浮层。事件带 editor 实例，多编辑器时只开对应那个。 */
export const OPEN_OUTLINE_EVENT = 'oc-editor:open-outline'

export interface OpenOutlineEventDetail {
  editor: Editor
}

export function requestOutline(editor: Editor): void {
  window.dispatchEvent(new CustomEvent<OpenOutlineEventDetail>(OPEN_OUTLINE_EVENT, { detail: { editor } }))
}
