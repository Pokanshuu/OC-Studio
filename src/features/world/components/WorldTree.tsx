'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { Plus, ChevronRight, ChevronDown, FileText, GripVertical, Pencil, Trash2 } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { ContextMenu } from '@/components/shared/ContextMenu'
import type { ContextMenuItem } from '@/components/shared/ContextMenu'
import { useLongPress } from '@/lib/useLongPress'
import { MobileActionSheet, type ActionItem } from '@/components/shared/MobileActionSheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { WorldEntry } from '@/types'

interface TreeNode {
  entry: WorldEntry
  children: TreeNode[]
}

export interface WorldTreeProps {
  entries: WorldEntry[]
  selectedId: number | null
  onSelect: (id: number, entry: WorldEntry) => void
  onCreate: (parentId: number | null, title: string) => void
  onDelete: (id: number) => void
  onRename: (id: number, title: string) => void
  onReorder: (updates: { id: number; parentId: number | null; order: number }[]) => void
  isMobile: boolean
}

const STORAGE_KEY = 'world-tree-expanded'

function loadExpanded(): Set<number> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return new Set(JSON.parse(raw) as number[])
  } catch { /* ignore */ }
  return new Set()
}

function saveExpanded(ids: Set<number>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids])) } catch { /* ignore */ }
}

function buildTree(entries: WorldEntry[]): TreeNode[] {
  const map = new Map<number, TreeNode>()
  const roots: TreeNode[] = []
  for (const entry of entries) {
    map.set(entry.id as number, { entry, children: [] })
  }
  for (const entry of entries) {
    const node = map.get(entry.id as number)!
    if (entry.parentId !== null && entry.parentId !== undefined) {
      const parent = map.get(entry.parentId)
      if (parent) parent.children.push(node)
      else roots.push(node)
    } else {
      roots.push(node)
    }
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.entry.order ?? 0) - (b.entry.order ?? 0) || a.entry.title.localeCompare(b.entry.title, 'zh-Hans'))
    for (const n of nodes) sort(n.children)
  }
  sort(roots)
  return roots
}

function computeReorder(
  entries: WorldEntry[],
  draggedId: number,
  newParentId: number | null,
  insertBeforeId: number | null,
): { id: number; parentId: number | null; order: number }[] {
  const dragged = entries.find((e) => e.id === draggedId)
  if (!dragged) return []
  const oldParentId = dragged.parentId
  const updates: { id: number; parentId: number | null; order: number }[] = []

  if (oldParentId !== newParentId && oldParentId !== undefined) {
    const oldSiblings = entries
      .filter((e) => e.parentId === oldParentId && e.id !== draggedId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title, 'zh-Hans'))
    for (let i = 0; i < oldSiblings.length; i++) {
      updates.push({ id: oldSiblings[i].id as number, parentId: oldParentId, order: i })
    }
  }

  const newSiblings = entries
    .filter((e) => e.parentId === newParentId && e.id !== draggedId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title, 'zh-Hans'))

  const insertIndex = insertBeforeId !== null
    ? newSiblings.findIndex((s) => s.id === insertBeforeId)
    : -1

  const finalIndex = insertIndex >= 0 ? insertIndex : newSiblings.length
  const reordered = [...newSiblings]
  reordered.splice(finalIndex, 0, { ...dragged, parentId: newParentId })

  for (let i = 0; i < reordered.length; i++) {
    const existing = updates.find((u) => u.id === reordered[i].id)
    if (!existing) {
      updates.push({ id: reordered[i].id as number, parentId: newParentId, order: i })
    }
  }

  return updates
}

function InlineEditInput({
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
        className="flex-1 min-w-0 bg-paper-card border border-line text-sm text-ink rounded px-1.5 py-0.5 focus:outline-none focus:border-line-hover"
      />
    </div>
  )
}

function SortableTreeItem({
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
  const entryId = node.entry.id as number
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

  const childIds = useMemo(() => node.children.map((c) => c.entry.id as number), [node.children])

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
        className={`group flex items-center gap-1 rounded-md py-1 transition-colors cursor-pointer ${
          isSelected
            ? 'bg-paper-card text-ink active:bg-black/8 dark:active:bg-white/8'
            : 'text-ink-muted hover:bg-paper-card hover:text-ink active:bg-black/8 dark:active:bg-white/8'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleRowClick}
        {...longPress}
      >
        {!isMobile ? (
          <span
            {...attributes}
            {...listeners}
            className="flex h-5 w-5 shrink-0 items-center justify-center cursor-grab text-ink-faint opacity-100 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity"
          >
            <GripVertical size={12} strokeWidth={2} />
          </span>
        ) : null}

        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); toggleExpand(entryId) }}
            className="flex h-5 w-5 shrink-0 items-center justify-center text-ink-faint"
          >
            {isExpanded ? <ChevronDown size={14} strokeWidth={2} /> : <ChevronRight size={14} strokeWidth={2} />}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}

        {isEditing ? (
          <InlineEditInput
            initialValue={node.entry.title}
            onSubmit={handleRename}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <span
            className="flex-1 truncate text-sm"
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
  )
}

export function WorldTree({
  entries,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onReorder,
  isMobile,
}: WorldTreeProps) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => loadExpanded())
  const [actionSheet, setActionSheet] = useState<{ open: boolean; title: string; actions: ActionItem[] }>({
    open: false, title: '', actions: [],
  })
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)

  const handleLongPress = useCallback((entryId: number, title: string) => {
    const entry = entries.find((e) => e.id === entryId)
    setActionSheet({
      open: true,
      title,
      actions: [
        { id: 'edit', label: '编辑', icon: <Pencil size={20} strokeWidth={2} />, onPress: () => { if (entry) onSelect(entryId, entry) } },
        { id: 'rename', label: '重命名', icon: <FileText size={20} strokeWidth={2} />, onPress: () => setEditingId(entryId) },
        { id: 'delete', label: '删除', icon: <Trash2 size={20} strokeWidth={2} />, destructive: true, onPress: () => setDeleteTarget(entryId) },
      ],
    })
  }, [entries, onSelect, onDelete, setEditingId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const tree = useMemo(() => buildTree(entries), [entries])

  const parentMap = useMemo(() => {
    const map = new Map<number, number | null>()
    for (const e of entries) {
      map.set(e.id as number, e.parentId)
    }
    return map
  }, [entries])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over, delta } = event
      if (!over || active.id === over.id) return

      const draggedId = active.id as number
      const overId = over.id as number
      const draggedParent = parentMap.get(draggedId) ?? null
      const overParent = parentMap.get(overId) ?? null

      const INDENT_THRESHOLD = 20
      let newParentId: number | null = overParent

      if (delta.x > INDENT_THRESHOLD) {
        if (overId !== draggedId) {
          newParentId = overId
        }
      } else if (delta.x < -INDENT_THRESHOLD && draggedParent !== null) {
        newParentId = parentMap.get(draggedParent) ?? null
      }

      const updates = computeReorder(entries, draggedId, newParentId, overId)
      if (updates.length > 0) onReorder(updates)
    },
    [entries, parentMap, onReorder],
  )

  return (
    <div className="flex h-full flex-col border-r border-line bg-paper-alt">
      {tree.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="text-center">
            <p className="text-xs text-ink-faint mb-2">暂无词条</p>
            <button
              onClick={() => onCreate(null, '新词条')}
              className="touch-feedback flex items-center gap-1 mx-auto rounded border border-line bg-paper-card px-3 py-1.5 text-sm text-ink-muted hover:text-ink hover:border-line-hover transition-colors"
            >
              <Plus size={14} strokeWidth={2} />
              <span>创建词条</span>
            </button>
          </div>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={tree.map((n) => n.entry.id as number)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex-1 overflow-auto py-1">
              {tree.map((node) => (
                <SortableTreeItem
                  key={node.entry.id}
                  node={node}
                  depth={0}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onDelete={onDelete}
                  onRename={onRename}
                  editingId={editingId}
                  setEditingId={setEditingId}
                  expandedIds={expandedIds}
                  setExpandedIds={setExpandedIds}
                  isMobile={isMobile}
                  onLongPress={() => handleLongPress(node.entry.id as number, node.entry.title)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <MobileActionSheet
        open={actionSheet.open}
        onClose={() => setActionSheet((prev) => ({ ...prev, open: false }))}
        title={actionSheet.title}
        actions={actionSheet.actions}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              删除后将移至回收站，可在 30 天内恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (deleteTarget !== null) {
                onDelete(deleteTarget)
                setDeleteTarget(null)
              }
            }}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
