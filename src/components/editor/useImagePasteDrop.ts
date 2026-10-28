'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { compressImageFile } from '@/lib/image-compress'
import { saveBlobToDisk } from '@/lib/image-service'

function transferOf(event: Event): DataTransfer | null {
  const carrier = event as Event & { dataTransfer?: DataTransfer; clipboardData?: DataTransfer }
  return carrier.clipboardData ?? carrier.dataTransfer ?? null
}

function imageFiles(data: DataTransfer | null): File[] {
  if (!data) return []
  const fromFiles = Array.from(data.files ?? []).filter((file) => file.type.startsWith('image/'))
  if (fromFiles.length) return fromFiles
  return Array.from(data.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
}

function isInside(node: Node | null, root: HTMLElement | null): boolean {
  return Boolean(root && node && (node === root || root.contains(node)))
}

interface DropPosition {
  from: number
  to: number
}

/**
 * 编辑器粘贴 / 拖拽图片：压缩 → 落盘 → 插入 imageBlock。
 *
 * 监听挂 document capture：ProseMirror 会重建 `view.dom`，挂在编辑器节点上的监听会
 * 随旧节点消失；capture 也早于 TipTap 自己的 paste 处理。只有真带图片文件时才
 * preventDefault，纯文字/HTML 粘贴照旧交给 TipTap。
 */
export function useImagePasteDrop(editor: Editor | null): { dragging: boolean } {
  const [dragging, setDragging] = useState(false)
  const busyRef = useRef(false)

  const run = useCallback(
    async (files: File[], position: DropPosition) => {
      if (!editor || files.length === 0 || busyRef.current) return
      busyRef.current = true
      try {
        const start = position.from
        if (position.from !== position.to) {
          editor.chain().focus().deleteRange(position).run()
        }

        // 同一批图片倒序插在同一位置，最终顺序仍是原顺序。
        for (const file of [...files].reverse()) {
          try {
            const prepared = await compressImageFile(file)
            const path = await saveBlobToDisk(prepared.blob, 'image')
            if (!path) continue
            editor
              .chain()
              .focus()
              .setTextSelection(start)
              .insertContent({ type: 'imageBlock', attrs: { src: path, width: null } })
              .run()
          } catch (error) {
            console.error('[image] 粘贴/拖拽插入失败:', error)
          }
        }
      } finally {
        busyRef.current = false
      }
    },
    [editor],
  )

  useEffect(() => {
    if (!editor) return
    const root = editor.view.dom

    const onPaste = (event: ClipboardEvent) => {
      if (!isInside(event.target as Node | null, root)) return
      const files = imageFiles(transferOf(event))
      if (files.length === 0) return
      event.preventDefault()
      const { from, to } = editor.state.selection
      void run(files, { from, to })
    }

    const onDragOver = (event: DragEvent) => {
      if (!isInside(event.target as Node | null, root)) return
      const types = event.dataTransfer ? Array.from(event.dataTransfer.types) : []
      if (!types.includes('Files')) return
      event.preventDefault()
      if (!busyRef.current) setDragging(true)
    }

    const onDragLeave = (event: DragEvent) => {
      const related = event.relatedTarget as Node | null
      if (related && (related === root || root.contains(related))) return
      setDragging(false)
    }

    const onDrop = (event: DragEvent) => {
      setDragging(false)
      if (!isInside(event.target as Node | null, root)) return
      const files = imageFiles(transferOf(event))
      if (files.length === 0) return
      event.preventDefault()
      const coords = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })
      const position = coords
        ? { from: coords.pos, to: coords.pos }
        : { from: editor.state.selection.from, to: editor.state.selection.to }
      void run(files, position)
    }

    const onDragEnd = () => setDragging(false)

    document.addEventListener('paste', onPaste, true)
    document.addEventListener('dragover', onDragOver, true)
    document.addEventListener('dragleave', onDragLeave, true)
    document.addEventListener('drop', onDrop, true)
    window.addEventListener('dragend', onDragEnd)
    return () => {
      document.removeEventListener('paste', onPaste, true)
      document.removeEventListener('dragover', onDragOver, true)
      document.removeEventListener('dragleave', onDragLeave, true)
      document.removeEventListener('drop', onDrop, true)
      window.removeEventListener('dragend', onDragEnd)
    }
  }, [editor, run])

  return { dragging }
}
