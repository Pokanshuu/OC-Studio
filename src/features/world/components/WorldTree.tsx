'use client'

import { useState, useCallback, useMemo } from 'react'
import { Pencil, FileText, Trash2 } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
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
import { SortableTreeItem } from './WorldTreeItem'
import { buildTree, computeReorder, loadExpanded } from './world-tree-utils'

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

export function WorldTree({
  entries,
  selectedId,
  onSelect,
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
  }, [entries, onSelect, setEditingId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const tree = useMemo(() => buildTree(entries), [entries])

  const parentMap = useMemo(() => {
    const map = new Map<number, number | null>()
    for (const e of entries) {
      map.set(e.id, e.parentId)
    }
    return map
  }, [entries])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over, delta } = event
      if (!over || active.id === over.id) return

      // dnd-kit 的 id 是 UniqueIdentifier（string | number）；这里显式转成 number 并校验，
      // 而不是强转 —— 否则字符串 id 会静默进入 Map 查询、拖拽无声失效。
      const draggedId = Number(active.id)
      const overId = Number(over.id)
      if (Number.isNaN(draggedId) || Number.isNaN(overId)) return

      const draggedParent = parentMap.get(draggedId) ?? null
      const overParent = parentMap.get(overId) ?? null

      const INDENT_THRESHOLD = 16
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
    <div className="flex h-full flex-col">
      {tree.length === 0 ? (
        /*
         * 空库时右栏已经有一整块「还没有词条 / 新建词条」的空状态，树这里只给一句话。
         * 以前这里是「暂无词条 + 创建词条」—— 同一屏两个按钮做同一件事，措辞还不一样
         *（创建 / 新建、暂无 / 还没有）。工具栏上也有「新建词条」，创建入口不会丢。
         */
        <div className="flex flex-1 items-center justify-center px-4">
          <p className="text-center text-xs leading-relaxed text-ink-faint">
            目录还是空的
            <br />
            点右上角的 ＋ 新建
          </p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={tree.map((n) => n.entry.id)}
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
                  onLongPress={() => handleLongPress(node.entry.id, node.entry.title)}
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
              删除后将移至回收站，可在回收站里恢复。
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

