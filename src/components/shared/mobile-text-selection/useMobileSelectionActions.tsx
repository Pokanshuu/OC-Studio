'use client'

import { useCallback } from 'react'
import { Scissors, Copy, ClipboardPaste, CheckSquare, Image, Table, Link2, Code2, Minus, Plus, Trash2 } from 'lucide-react'
import type { Editor } from '@tiptap/core'
import type { ActionItem } from '../MobileActionSheet'
import { isNativeInput } from './geometry'
import { readClipboardText, safeGetEditorDom } from './clipboard'
import type { MobileSelectionCtx } from './useMobileSelectionState'

/**
 * 选词工具栏的动作：剪切 / 复制 / 粘贴 / 全选，以及动作面板（插入、表格）的条目定义。
 * 事件派发统一走 `mobile:*` CustomEvent，由编辑器侧监听。
 */
export function useMobileSelectionActions(ctx: MobileSelectionCtx, activeEditor: Editor | null) {
  const { dispatch, editableRef, suppressNextFocusRef, selectionConsumeLockRef, actionTakenRef } = ctx

  const focusEditable = useCallback(() => {
    editableRef.current?.focus()
  }, [editableRef])

  const dispatchEditorEvent = useCallback((name: string) => {
    if (activeEditor?.isDestroyed) return
    const editorDom = safeGetEditorDom(activeEditor)
    const dom = editableRef.current === editorDom
      ? editorDom
      : editableRef.current
    dom?.dispatchEvent(new CustomEvent(name, { bubbles: true }))
  }, [activeEditor, editableRef])

  const handleCut = useCallback(() => {
    suppressNextFocusRef.current = true
    selectionConsumeLockRef.current = true
    setTimeout(() => { selectionConsumeLockRef.current = false }, 200)
    focusEditable()
    try { document.execCommand('cut') } catch { /* */ }
    // Collapse selection to prevent selectionchange from re-showing the bar
    const el = editableRef.current
    if (el && isNativeInput(el)) {
      const pos = el.selectionEnd ?? 0
      el.setSelectionRange(pos, pos)
    } else if (activeEditor && !activeEditor.isDestroyed) {
      const { to } = activeEditor.state.selection
      activeEditor.commands.setTextSelection(to)
    }
    dispatch({ type: 'DISMISS' })
  }, [focusEditable, dispatch, activeEditor, editableRef, suppressNextFocusRef, selectionConsumeLockRef])

  const handleCopy = useCallback(() => {
    suppressNextFocusRef.current = true
    selectionConsumeLockRef.current = true
    setTimeout(() => { selectionConsumeLockRef.current = false }, 200)
    focusEditable()
    try { document.execCommand('copy') } catch { /* */ }
    // Collapse selection to prevent selectionchange from re-showing the bar
    const el = editableRef.current
    if (el && isNativeInput(el)) {
      const pos = el.selectionEnd ?? 0
      el.setSelectionRange(pos, pos)
    } else if (activeEditor && !activeEditor.isDestroyed) {
      const { to } = activeEditor.state.selection
      activeEditor.commands.setTextSelection(to)
    }
    dispatch({ type: 'DISMISS' })
  }, [focusEditable, dispatch, activeEditor, editableRef, suppressNextFocusRef, selectionConsumeLockRef])

  const handlePaste = useCallback(async () => {
    suppressNextFocusRef.current = true
    const el = editableRef.current
    if (!el) return

    if (isNativeInput(el)) {
      el.focus()
      try {
        const text = await readClipboardText()
        if (text != null) {
          const start = el.selectionStart ?? 0
          const end = el.selectionEnd ?? 0
          el.setRangeText(text, start, end, 'end')
          el.dispatchEvent(new Event('input', { bubbles: true }))
        }
      } catch { /* */ }
    } else {
      focusEditable()
      const editor = activeEditor
      try {
        const text = await readClipboardText()
        if (text != null && editor && !editor.isDestroyed) {
          editor.commands.insertContent(text)
        }
      } catch { /* */ }
    }
    dispatch({ type: 'DISMISS' })
  }, [focusEditable, dispatch, activeEditor, editableRef, suppressNextFocusRef])

  const handleSelectAll = useCallback(() => {
    suppressNextFocusRef.current = true
    focusEditable()
    const el = editableRef.current
    if (el && isNativeInput(el)) {
      el.select()
    } else {
      activeEditor?.chain().focus().selectAll().run()
    }
  }, [focusEditable, activeEditor, editableRef, suppressNextFocusRef])

  // ── action items ──

  const clipboardActions: ActionItem[] = [
    { id: 'cut', label: '剪切', icon: <Scissors size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; handleCut() } },
    { id: 'copy', label: '复制', icon: <Copy size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; handleCopy() } },
    { id: 'paste', label: '粘贴', icon: <ClipboardPaste size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; handlePaste() } },
    { id: 'selectAll', label: '全选', icon: <CheckSquare size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; handleSelectAll() } },
  ]

  const insertActions: ActionItem[] = [
    { id: 'insertImage', label: '插入图片', icon: <Image size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; dispatchEditorEvent('mobile:insert-image') } },
    { id: 'insertTable', label: '插入表格', icon: <Table size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; dispatchEditorEvent('mobile:insert-table') } },
    { id: 'insertLink', label: '插入链接', icon: <Link2 size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; dispatchEditorEvent('mobile:insert-link') } },
    { id: 'insertCode', label: '插入代码块', icon: <Code2 size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; dispatchEditorEvent('mobile:insert-code') } },
    { id: 'insertDivider', label: '分割线', icon: <Minus size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; dispatchEditorEvent('mobile:insert-divider') } },
  ]

  const tableActions: ActionItem[] = [
    { id: 'addRowBefore', label: '在上方插入行', icon: <Plus size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; dispatchEditorEvent('mobile:table-add-row-before') } },
    { id: 'addRowAfter', label: '在下方插入行', icon: <Plus size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; dispatchEditorEvent('mobile:table-add-row-after') } },
    { id: 'addColBefore', label: '在左侧插入列', icon: <Plus size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; dispatchEditorEvent('mobile:table-add-col-before') } },
    { id: 'addColAfter', label: '在右侧插入列', icon: <Plus size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; dispatchEditorEvent('mobile:table-add-col-after') } },
    { id: 'deleteRow', label: '删除当前行', icon: <Trash2 size={20} strokeWidth={2} />, destructive: true, onPress: () => { actionTakenRef.current = true; dispatchEditorEvent('mobile:table-delete-row') } },
    { id: 'deleteCol', label: '删除当前列', icon: <Trash2 size={20} strokeWidth={2} />, destructive: true, onPress: () => { actionTakenRef.current = true; dispatchEditorEvent('mobile:table-delete-col') } },
    { id: 'deleteTable', label: '删除整个表格', icon: <Trash2 size={20} strokeWidth={2} />, destructive: true, onPress: () => { actionTakenRef.current = true; dispatchEditorEvent('mobile:table-delete') } },
  ]

  return {
    handleCut, handleCopy, handlePaste, handleSelectAll,
    clipboardActions, insertActions, tableActions,
  }
}


