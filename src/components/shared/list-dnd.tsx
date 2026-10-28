'use client'

/**
 * 拖拽排序的公共基础件（@dnd-kit）。
 *
 * 三张列表（角色 / 事件 / 国家）和设置里的字段表共用同一套交互：
 * DndContext + SortableContext 在外层，具体卡片/行自己调用 `useSortableItem`
 * 把 ref / transform 挂到**自己的根节点**上（不要套一层 div —— 网格布局会错位）。
 *
 * 手柄是唯一的拖拽入口（`DragHandle`）：卡片可以照常点击进入，不会误触拖拽。
 */

import type { ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

type DragListeners = ReturnType<typeof useSortable>['listeners']

interface SortableListProps {
  /** 当前顺序的 id（数字或字符串，必须与 useSortableItem 的 id 一致） */
  ids: (number | string)[]
  onReorder: (activeId: number | string, overId: number | string) => void
  /** 网格用 rectSortingStrategy，竖排用 verticalListSortingStrategy */
  layout?: 'grid' | 'list'
  /** 关闭拖拽（例如当前不是「手动排序」） */
  disabled?: boolean
  children: ReactNode
}

export function SortableList({
  ids,
  onReorder,
  layout = 'grid',
  disabled = false,
  children,
}: SortableListProps) {
  const sensors = useSensors(
    // 4px 才起拖：点一下仍然是点击，不会把「打开」变成「拖动」
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    onReorder(active.id, over.id)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext
        items={ids}
        strategy={layout === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}
        disabled={disabled}
      >
        {children}
      </SortableContext>
    </DndContext>
  )
}

/** 挂在卡片/行自己的根节点上：ref + 位移动画 + 被拖起时的样式 */
export function useSortableItem(id: number | string, disabled: boolean) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  })

  return {
    setNodeRef,
    attributes,
    listeners,
    isDragging,
    style: {
      transform: CSS.Transform.toString(transform),
      transition,
      // 被拖起的那一项半透明 + 抬高，落点一眼能看清
      opacity: isDragging ? 0.55 : undefined,
      zIndex: isDragging ? 30 : undefined,
    } satisfies React.CSSProperties,
  }
}

interface DragHandleProps {
  /** 来自 useSortableItem */
  handleProps: {
    attributes: DraggableAttributes
    listeners: DragListeners
  }
  /** overlay = 压在图片上的圆形手柄；inline = 行内方形手柄 */
  tone?: 'overlay' | 'inline'
  className?: string
}

export function DragHandle({ handleProps, tone = 'inline', className = '' }: DragHandleProps) {
  const { attributes, listeners } = handleProps
  const base =
    'flex items-center justify-center transition-colors touch-none cursor-grab active:cursor-grabbing'
  const skin =
    tone === 'overlay'
      ? 'h-6 w-6 rounded-full bg-black/30 text-white/80 hover:bg-black/50'
      : 'h-6 w-6 rounded-item text-ink-faint hover:text-ink'

  return (
    <button
      type="button"
      aria-label="拖动排序"
      title="拖动排序"
      {...attributes}
      {...listeners}
      onClick={(event) => event.stopPropagation()}
      className={`${base} ${skin} ${className}`}
    >
      <GripVertical size={14} strokeWidth={2} />
    </button>
  )
}

/** 把 active 移到 over 的位置（不动目标之外的相对顺序） */
export function moveId<T>(ids: T[], activeId: T, overId: T): T[] {
  const from = ids.indexOf(activeId)
  const to = ids.indexOf(overId)
  if (from < 0 || to < 0 || from === to) return ids
  const next = [...ids]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
