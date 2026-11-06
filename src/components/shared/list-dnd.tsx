'use client'

/**
 * 拖拽排序的公共基础件（@dnd-kit）。
 *
 * 三张列表（角色 / 事件 / 国家）和设置里的字段表共用同一套交互：
 * DndContext + SortableContext 在外层，具体卡片/行自己调用 `useSortableItem`
 * 把 ref / transform 挂到**自己的根节点**上（不要套一层 div —— 网格布局会错位）。
 *
 * 手柄是唯一的拖拽入口（`DragHandle`）：卡片可以照常点击进入，不会误触拖拽。
 *
 * 「压住另一项 → 叠成文件夹」（`onMerge`）：给列表传了这个回调，拖着一项压住另一项
 * **停一下（400ms）** 再松手就不是换位，而是把这两项叠成一个文件夹（图标手势）。
 * 排序的落点预览是实时的，所以靠三件事把两种意图分开：
 * - 一压上去先亮文件夹小标（不用猜要等多久），停够了才变成「松手新建文件夹」
 * - 落点带迟滞（`COLLISION_HYSTERESIS`）：停住时不会因为 1px 抖动来回换目标
 * - 桌面按住 Alt 掠过哪张就是哪张，完全不用等
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type CollisionDetection,
  type DraggableAttributes,
  type UniqueIdentifier,
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
import { centerOfRect, rankCollisions, type CollisionCandidate } from './list-dnd-collision'

type DragListeners = ReturnType<typeof useSortable>['listeners']

interface SortableListProps {
  /** 当前顺序的 id（数字或字符串，必须与 useSortableItem 的 id 一致） */
  ids: (number | string)[]
  onReorder: (activeId: number | string, overId: number | string) => void
  /**
   * 拖着一项压住另一项**停住**再松手时调用（一张卡叠到另一张上 = 新建文件夹）。
   * 给了才启用；不给就是纯排序，行为和以前完全一样。
   */
  onMerge?: (activeId: number | string, targetId: number | string) => void
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

interface SortableState {
  activation: SortActivation
  /** 驻留够了、松手就会叠成文件夹的那一项（null = 只是排序） */
  mergeTargetId: UniqueIdentifier | null
  /** 正被压着的那一项（还没到时间 / 或按着 Alt 已直接成为目标）：卡片上给即时提示 */
  mergeHoverId: UniqueIdentifier | null
  /** 这个列表支不支持拖拽成夹（`onMerge` 给了、且当前没被禁用） */
  mergeEnabled: boolean
}

const SortableStateContext = createContext<SortableState>({
  activation: 'handle',
  mergeTargetId: null,
  mergeHoverId: null,
  mergeEnabled: false,
})

/** 长按起拖的阈值：和 `useLongPress` 一致（320ms / 8px），全站手感统一 */
const LONG_PRESS_DELAY = 320
const LONG_PRESS_TOLERANCE = 8

/**
 * 「叠成文件夹」的驻留阈值（ms）。
 * 只要压在另一项上停一下就算，不需要「一动不动」—— 停住之后目标就锁住，
 * 之后再抖也不会撤销（撤销只在换目标 / 松手 / 按 Esc 时发生）。
 */
const MERGE_DWELL = 400
/** 驻留期间允许的抖动（px）：超过就算「还在找位置」，计时重来 */
const MERGE_TOLERANCE = 12

function sameId(a: UniqueIdentifier | null, b: UniqueIdentifier | null): boolean {
  if (a === null || b === null) return false
  return String(a) === String(b)
}

export function SortableList({
  ids,
  onReorder,
  onMerge,
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

  const [dragging, setDragging] = useState(false)
  /** 压在谁身上（即时投放态：卡上一出现文件夹小标，就知道「停一下能成夹」） */
  const [hoverTargetId, setHoverTargetId] = useState<UniqueIdentifier | null>(null)
  /** 驻留够了、松手就成夹的那一项 */
  const [mergeTargetId, setMergeTargetId] = useState<UniqueIdentifier | null>(null)
  /** 当前压在谁身上（用来判断有没有换目标） */
  const hoverIdRef = useRef<UniqueIdentifier | null>(null)
  /** 正在拖的是哪一项（Alt 抢目标的那个入口要拿它排除自己） */
  const activeIdRef = useRef<UniqueIdentifier | null>(null)
  /** 驻留计时的起点（拖拽累计位移）；抖太多就重来 */
  const dwellAnchorRef = useRef<{ x: number; y: number } | null>(null)
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 键盘拖拽不起夹：按住方向键停在某一项上不等于想叠文件夹 */
  const pointerDragRef = useRef(false)
  /** 桌面：按住 Alt（⌥）掠过哪张卡，哪张直接就是成夹目标，不用等 */
  const altRef = useRef(false)

  const clearDwell = useCallback(() => {
    if (dwellTimerRef.current !== null) {
      clearTimeout(dwellTimerRef.current)
      dwellTimerRef.current = null
    }
  }, [])

  // 卸载 / 取消拖拽时别把计时器落到后台
  useEffect(() => clearDwell, [clearDwell])

  const resetMerge = useCallback(() => {
    clearDwell()
    hoverIdRef.current = null
    dwellAnchorRef.current = null
    setHoverTargetId(null)
    setMergeTargetId(null)
  }, [clearDwell])

  /** 从当前位移开始重新计时：只有真的「停在这儿」才会成夹 */
  const startDwell = useCallback(
    (hoverId: UniqueIdentifier, delta: { x: number; y: number }) => {
      clearDwell()
      dwellAnchorRef.current = { x: delta.x, y: delta.y }
      dwellTimerRef.current = setTimeout(() => {
        dwellTimerRef.current = null
        // 停住之后 dnd-kit 不会再来事件：到点就认下这一项
        if (sameId(hoverIdRef.current, hoverId)) setMergeTargetId(hoverId)
      }, MERGE_DWELL)
    },
    [clearDwell],
  )

  const mergeEnabled = onMerge !== undefined && !disabled

  /**
   * 落点：**以指针为准** + 迟滞（判定本身在 `list-dnd-collision.ts` 里，纯函数可自检）。
   * 指针落在哪一项的格子里就是哪一项；落在空隙里才比中心距离。
   */
  const collisionDetection: CollisionDetection = (args) => {
    const { pointerCoordinates, droppableContainers, droppableRects, collisionRect } = args
    const candidates: (CollisionCandidate & { container: (typeof droppableContainers)[number] })[] = []
    for (const container of droppableContainers) {
      const rect = droppableRects.get(container.id)
      if (rect) candidates.push({ id: container.id, rect, container })
    }
    const point = pointerCoordinates ?? centerOfRect(collisionRect)
    return rankCollisions(candidates, point, hoverIdRef.current).map(({ id, value, candidate }) => ({
      id,
      data: { droppableContainer: candidate.container, value },
    }))
  }

  /** 拖拽中按住 Alt：当前压着的那一项立刻变成成夹目标（桌面上的「一步到位」） */
  useEffect(() => {
    if (!dragging || !mergeEnabled) return
    const arm = (): void => {
      const hoverId = hoverIdRef.current
      if (hoverId === null || sameId(hoverId, activeIdRef.current)) return
      setMergeTargetId(hoverId)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Alt' || altRef.current) return
      altRef.current = true
      clearDwell()
      arm()
    }
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key !== 'Alt') return
      altRef.current = false
      // 松掉 Alt 就退回「驻留」模式：先收掉，压着不放它会自己再亮起来
      setMergeTargetId(null)
      const hoverId = hoverIdRef.current
      if (hoverId !== null) startDwell(hoverId, dwellAnchorRef.current ?? { x: 0, y: 0 })
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [dragging, mergeEnabled, clearDwell, startDwell])

  const handleDragStart = (event: DragStartEvent) => {
    // PointerSensor 的激活事件是 pointerdown；键盘是 keydown
    pointerDragRef.current = event.activatorEvent.type === 'pointerdown'
    // 起拖时 Alt 已经按着（先按 Alt 再拖），也算数
    altRef.current = (event.activatorEvent as PointerEvent).altKey === true
    activeIdRef.current = event.active.id
    setDragging(true)
    resetMerge()
  }

  const handleDragOver = (event: DragOverEvent) => {
    if (!mergeEnabled || !pointerDragRef.current) return
    const { active, over } = event
    const hoverId = over?.id ?? null
    if (sameId(hoverId, hoverIdRef.current)) return

    // 换了目标（或离开了任何一项）：之前攒的驻留时间作废
    hoverIdRef.current = hoverId
    dwellAnchorRef.current = null
    clearDwell()
    setMergeTargetId(null)
    const other = hoverId !== null && !sameId(hoverId, active.id) ? hoverId : null
    setHoverTargetId(other)
    if (other === null) return
    if (altRef.current) {
      setMergeTargetId(other)
      return
    }
    startDwell(other, event.delta)
  }

  const handleDragMove = (event: DragMoveEvent) => {
    if (!mergeEnabled) return
    // 已经锁定或按着 Alt：不动摇，直接松手就成夹
    if (mergeTargetId !== null || altRef.current) return
    const anchor = dwellAnchorRef.current
    const hoverId = hoverIdRef.current
    if (anchor === null || hoverId === null) return
    const moved =
      Math.abs(event.delta.x - anchor.x) > MERGE_TOLERANCE ||
      Math.abs(event.delta.y - anchor.y) > MERGE_TOLERANCE
    if (!moved) return
    // 还在找位置：从这一刻重新计时
    startDwell(hoverId, event.delta)
  }

  const finish = () => {
    setDragging(false)
    altRef.current = false
    activeIdRef.current = null
    resetMerge()
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    const targetId = mergeTargetId
    finish()

    if (targetId !== null && !sameId(targetId, active.id) && onMerge) {
      onMerge(active.id, targetId)
      return
    }
    if (!over || sameId(active.id, over.id)) return
    onReorder(active.id, over.id)
  }

  return (
    <SortableStateContext.Provider
      value={{ activation, mergeTargetId, mergeHoverId: hoverTargetId, mergeEnabled }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={finish}
      >
        <SortableContext
          items={ids}
          strategy={layout === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}
          disabled={disabled}
        >
          {children}
        </SortableContext>
      </DndContext>
    </SortableStateContext.Provider>
  )
}

/** 挂在卡片/行自己的根节点上：ref + 位移动画 + 被拖起时的样式 */
export function useSortableItem(id: number | string, disabled: boolean) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  })
  const { activation, mergeTargetId, mergeHoverId, mergeEnabled } = useContext(SortableStateContext)
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
    /** 这个列表支持拖拽成夹（手柄提示文案用） */
    mergeEnabled,
    /** 这一项被压住并驻留够了：松手就把它和拖着的那个叠成文件夹 */
    mergeTarget: sameId(mergeTargetId, id),
    /** 这一项正被压着（还没到时间）：给个文件夹小标，让人知道「停一下能成夹」 */
    mergeHover: sameId(mergeHoverId, id) && !sameId(mergeTargetId, id),
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
  /** 提示文案（默认「拖动排序」）；列表支持拖拽成夹时换成带说明的那一句 */
  hint?: string
  className?: string
}

export function DragHandle({ handleProps, tone = 'inline', hint, className = '' }: DragHandleProps) {
  const { attributes, listeners } = handleProps
  const label = hint ?? '拖动排序'

  if (tone === 'overlay') {
    return (
      <OverlayIconButton
        label={label}
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
      aria-label={label}
      title={label}
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
