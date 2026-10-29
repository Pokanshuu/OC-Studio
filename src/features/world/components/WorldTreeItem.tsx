'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { ChevronRight, FileText, GripVertical } from 'lucide-react'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { ContextMenu } from '@/components/shared/ContextMenu'
import type { ContextMenuItem } from '@/components/shared/ContextMenu'
import { useLongPress } from '@/lib/useLongPress'
import type { WorldEntry } from '@/types'
import { saveExpanded } from './world-tree-utils'
import type { TreeNode } from './world-tree-utils'

/** 树内联重命名输入框（回车提交 / Esc 取消 / 失焦提交） */
export function InlineEditInput({
  initialValue,
  onSubmit,
  onCancel,
}: {
  initialValue: string
  onSubmit: (value: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const commit = useCallback(() => {
    const trimmed = value.trim()
    if (trimmed) onSubmit(trimmed)
    else onCancel()
  }, [value, onSubmit, onCancel])

  return (
    <div className="flex flex-1 items-center gap-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onCancel() }}
        onBlur={commit}
        className="min-w-0 flex-1 border-b border-line bg-transparent px-0 py-0.5 text-[13px] text-ink focus:border-line-hover focus:outline-none"
      />
    </div>
  )
}

/** 可拖拽的树节点（含子级递归） */
export function SortableTreeItem({
  node,
  depth,
  selectedId,
  onSelect,
  onDelete,
  onRename,
  editingId,
  setEditingId,
  expandedIds,
  setExpandedIds,
  isMobile,
  onLongPress,
}: {
  node: TreeNode
  depth: number
  selectedId: number | null
  onSelect: (id: number, entry: WorldEntry) => void
  onDelete: (id: number) => void
  onRename: (id: number, title: string) => void
  editingId: number | null
  setEditingId: (id: number | null) => void
  expandedIds: Set<number>
  setExpandedIds: React.Dispatch<React.SetStateAction<Set<number>>>
  isMobile: boolean
  onLongPress?: () => void
}) {
  const entryId = node.entry.id
  const isSelected = selectedId === entryId
  const isExpanded = expandedIds.has(entryId)
  const hasChildren = node.children.length > 0
  const isEditing = editingId === entryId

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entryId,
    disabled: isEditing || isMobile,
  })

  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }

  const childIds = useMemo(() => node.children.map((c) => c.entry.id), [node.children])

  const toggleExpand = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveExpanded(next)
      return next
    })
  }, [setExpandedIds])

  const handleRenameClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(entryId)
  }, [entryId, setEditingId])

  const handleRename = useCallback((newTitle: string) => {
    onRename(entryId, newTitle)
    setEditingId(null)
  }, [entryId, onRename, setEditingId])

  const handleRowClick = useCallback(() => {
    onSelect(entryId, node.entry)
  }, [entryId, node.entry, onSelect])

  const treeContextMenuItems = useMemo((): ContextMenuItem[] => [
    {
      label: '重命名',
      onClick: () => setEditingId(entryId),
    },
    { separator: true, label: '', onClick: () => {} },
    {
      label: '删除',
      danger: true,
      onClick: () => onDelete(entryId),
    },
  ], [entryId, setEditingId, onDelete])

  return (
    <div ref={setNodeRef} style={style}>
      <ContextMenu items={treeContextMenuItems}>
      <div
        className={`group flex items-center gap-0.5 rounded-item py-1 text-[13px] transition-colors cursor-pointer ${
          isSelected
            ? 'bg-[var(--oc-hover)] text-ink'
            : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
        }`}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
        onClick={handleRowClick}
        {...longPress}
      >
        {!isMobile ? (
          <span
            {...attributes}
            {...listeners}
            className="flex h-4 w-4 shrink-0 items-center justify-center cursor-grab text-ink-faint opacity-100 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity"
          >
            <GripVertical size={11} strokeWidth={2} />
          </span>
        ) : null}

        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); toggleExpand(entryId) }}
            className="flex h-4 w-4 shrink-0 items-center justify-center text-ink-faint"
          >
            <ChevronRight
              size={13}
              strokeWidth={2}
              className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {isEditing ? (
          <InlineEditInput
            initialValue={node.entry.title}
            onSubmit={handleRename}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <span
            className="flex-1 truncate pl-0.5 text-[13px]"
            onDoubleClick={handleRenameClick}
            title="双击重命名"
          >
            {node.entry.isConcept ? (
              <span className="inline-flex items-center gap-1">
                <FileText size={12} strokeWidth={2} className="text-ink-faint shrink-0" />
                {node.entry.title}
              </span>
            ) : (
              node.entry.title
            )}
          </span>
        )}

        <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity">
          {!isMobile ? (
            <DeleteButton onDelete={() => onDelete(entryId)} />
          ) : null}
        </div>
      </div>
      </ContextMenu>

      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${isExpanded && hasChildren ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="min-h-0 overflow-hidden">
          {isExpanded && hasChildren ? (
            <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
              {node.children.map((child) => (
                <SortableTreeItem
                  key={child.entry.id}
                  node={child}
                  depth={depth + 1}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onDelete={onDelete}
                  onRename={onRename}
                  editingId={editingId}
                  setEditingId={setEditingId}
                  expandedIds={expandedIds}
                  setExpandedIds={setExpandedIds}
                  isMobile={isMobile}
                  onLongPress={onLongPress}
                />
              ))}
            </SortableContext>
          ) : null}
        </div>
      </div>
    </div>
  )
}
