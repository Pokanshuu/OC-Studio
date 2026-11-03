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

import { createContext, useContext, type ReactNode } from 'react'
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
import { OverlayIconButton } from './OverlayIconButton'

type DragListeners = ReturnType<typeof useSortable>['listeners']

interface SortableListProps {
  /** 当前顺序的 id（数字或字符串，必须与 useSortableItem 的 id 一致） */
  ids: (number | string)[]
  onReorder: (activeId: number | string, overId: number | string) => void
  /** 网格用 rectSortingStrategy，竖排用 verticalListSortingStrategy */
  layout?: 'grid' | 'list'
  /** 关闭拖拽（例如当前不是「手动排序」） */
  disabled?: boolean
  /**
   * 怎么起拖：
   * - `handle`（默认）：只能抓左侧手柄，4px 起拖 —— 桌面精确、绝不误触
   * - `longPress`：**整张卡片**按住 320ms 起拖（移动端没有 hover 手柄，这是唯一顺手的入口）；
   *   阈值内松手仍然是点击，不耽误进入详情
   */
  activation?: 'handle' | 'longPress'
  children: ReactNode
}

type SortActivation = 'handle' | 'longPress'

const SortActivationContext = createContext<SortActivation>('handle')

/** 长按起拖的阈值：和 `useLongPress` 一致（320ms / 8px），全站手感统一 */
const LONG_PRESS_DELAY = 320
const LONG_PRESS_TOLERANCE = 8

export function SortableList({
  ids,
  onReorder,
  layout = 'grid',
  disabled = false,
  activation = 'handle',
  children,
}: SortableListProps) {
  // 两个传感器都无条件创建（Hooks 不能条件调用），只切换起拖阈值
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint:
      activation === 'longPress'
        ? { delay: LONG_PRESS_DELAY, tolerance: LONG_PRESS_TOLERANCE }
        : // 4px 才起拖：点一下仍然是点击，不会把「打开」变成「拖动」
          { distance: 4 },
  })
  const keyboardSensor = useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  const sensors = useSensors(pointerSensor, keyboardSensor)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    onReorder(active.id, over.id)
  }

  return (
    <SortActivationContext.Provider value={activation}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={ids}
          strategy={layout === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}
          disabled={disabled}
        >
          {children}
        </SortableContext>
      </DndContext>
    </SortActivationContext.Provider>
  )
}

/** 挂在卡片/行自己的根节点上：ref + 位移动画 + 被拖起时的样式 */
export function useSortableItem(id: number | string, disabled: boolean) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  })
  const activation = useContext(SortActivationContext)
  const longPress = activation === 'longPress' && !disabled

  return {
    setNodeRef,
    attributes,
    listeners,
    isDragging,
    /** 长按模式：把这两个铺到**卡片根节点**上，整张卡都可长按起拖 */
    longPress,
    cardAttributes: longPress ? attributes : undefined,
    cardListeners: longPress ? listeners : undefined,
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

  if (tone === 'overlay') {
    return (
      <OverlayIconButton
        label="拖动排序"
        {...attributes}
        {...listeners}
        onClick={(event) => event.stopPropagation()}
        className={`touch-none cursor-grab active:cursor-grabbing ${className}`}
      >
        <GripVertical size={14} strokeWidth={2} />
      </OverlayIconButton>
    )
  }

  return (
    <button
      type="button"
      aria-label="拖动排序"
      title="拖动排序"
      {...attributes}
      {...listeners}
      onClick={(event) => event.stopPropagation()}
      className={`flex h-6 w-6 items-center justify-center rounded-item text-ink-faint transition-colors touch-none cursor-grab hover:text-ink active:cursor-grabbing ${className}`}
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
