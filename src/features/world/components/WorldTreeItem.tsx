'use client'

import { useCallback, useMemo } from 'react'
import { FileText } from 'lucide-react'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { TreeRow } from '@/components/shared/TreeRow'
import type { ContextMenuItem } from '@/components/shared/ContextMenu'
import { useLongPress } from '@/lib/useLongPress'
import type { WorldEntry } from '@/types'
import { saveExpanded } from './world-tree-utils'
import type { TreeNode } from './world-tree-utils'

/** 兼容旧引用：内联编辑框已收口到 `components/shared/TreeRow` */
export { InlineEditInput } from '@/components/shared/TreeRow'

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
      <TreeRow
        depth={depth}
        selected={isSelected}
        title={node.entry.title}
        icon={node.entry.isConcept ? <FileText size={12} strokeWidth={2} /> : undefined}
        onClick={handleRowClick}
        onStartRename={() => setEditingId(entryId)}
        editing={isEditing}
        onCommitRename={handleRename}
        onCancelRename={() => setEditingId(null)}
        expanded={isExpanded}
        onToggleExpand={hasChildren ? () => toggleExpand(entryId) : undefined}
        dragHandle={isMobile ? undefined : { attributes, listeners }}
        actions={isMobile ? undefined : <DeleteButton onDelete={() => onDelete(entryId)} />}
        contextMenu={treeContextMenuItems}
        rowProps={longPress as React.HTMLAttributes<HTMLDivElement>}
      />

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
