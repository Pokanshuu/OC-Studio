'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * 列表的桌面选中模型（角色 / 事件 / 国家 / 自定义分类共用）。
 *
 * 桌面应用的列表有四件事是「基本手感」，网页表格往往一件都没有：
 * **方向键移动、Ctrl / Shift 多选、Delete 删除、右键对选中项出菜单**。
 * 本文件的 hook 把这一层做全，列表项自己不用再写 `role="button"` 与 `onKeyDown`。
 *
 * 刻意保留「**单击即打开**」（Notion / Obsidian 的文件列表也是这样）：
 * 单击 = 选中 + 打开，Ctrl 单击 = 只切换选中，Shift 单击 = 从锚点选一段。
 *
 * 与 dnd-kit 共存：`list-dnd.tsx` 的 `KeyboardSensor` 只在**拖拽手柄**上挂监听
 * （桌面 `activation='handle'`，`listeners` 只 spread 到手柄那个按钮上），
 * 所以卡片 / 行本体上的方向键不会进拖拽 —— 那里由本 hook 接管。
 *
 * 所有几何 / 区间逻辑都是纯函数（`moveIndex` / `gridIndex` / `rangeBetween` / `pruneIds`），
 * `tests/list-navigation.test.ts` 盯着它们。
 */

/** 一行的列数：给数字就是固定几列；给函数就现算（通常是量容器） */
export type ListColumns = number | (() => number)

export interface ListNavigationOptions<Id extends number | string> {
  /** 当前可见顺序（筛选 / 排序之后） */
  ids: readonly Id[]
  /** 网格视图一行几个；不给就量容器里第一行的实际数量 */
  columns?: ListColumns
  /** 单击 / Enter：打开 */
  onOpen: (id: Id) => void
  /** Delete / Backspace：走调用方现有的确认弹窗 */
  onDelete?: (ids: Id[]) => void
  /** F2 */
  onRename?: (id: Id) => void
  /** 右键 / Shift+F10：调用方弹自己的菜单 */
  onContextMenu?: (ids: Id[], at: { x: number; y: number }) => void
  /** 关闭整套键盘与多选（移动端长按动作表保持现状） */
  enabled?: boolean
}

export interface ListItemHandlers {
  /** 列表项的 DOM id（焦点移动时用它找元素） */
  id: string
  tabIndex: 0 | -1
  'aria-selected': boolean
  'data-selected'?: 'true'
  'data-list-item'?: ''
  onFocus: () => void
  onClick: (event: React.MouseEvent) => void
  onContextMenu: (event: React.MouseEvent) => void
}

export interface ListNavigation<Id extends number | string> {
  focusedId: Id | null
  selectedIds: ReadonlySet<Id>
  /** 挂到列表容器（`<ul>` / `<div role="grid">`）上 */
  containerProps: {
    ref: (element: HTMLElement | null) => void
    onKeyDown: (event: React.KeyboardEvent) => void
    role: 'listbox' | 'grid'
    'aria-multiselectable': true
    tabIndex: -1
    'data-list-nav': ''
  }
  itemProps: (id: Id) => ListItemHandlers
  /** 供右键菜单 / 批量动作读取（`selectedIds` 为空时就是焦点项） */
  effectiveIds: Id[]
}

/* ── 纯逻辑（可单测） ───────────────────────────────────── */

/** 一次键盘导航的结果动作 */
export type ListKeyAction =
  | { type: 'focus'; index: number }
  | { type: 'open' }
  | { type: 'delete' }
  | { type: 'rename' }
  | { type: 'select-all' }
  | { type: 'context-menu' }
  | { type: 'clear' }
  | null

export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0
  return Math.min(count - 1, Math.max(0, index))
}

/** 行视图上下、网格左右：按 delta 移动并夹在两端（不环绕） */
export function moveIndex(current: number, delta: number, count: number): number {
  return clampIndex(current + delta, count)
}

/**
 * 网格方向键：←/→ 在本行内移动，↑/↓ 按列数跳。
 * 越界一律夹住 —— 原生列表（资源管理器、Obsidian）也不环绕。
 */
export function gridIndex(
  current: number,
  key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
  columns: number,
  count: number,
): number {
  const cols = Math.max(1, columns)
  if (key === 'ArrowLeft') return moveIndex(current, -1, count)
  if (key === 'ArrowRight') return moveIndex(current, 1, count)
  if (key === 'ArrowUp') return moveIndex(current, -cols, count)
  return moveIndex(current, cols, count)
}

/** 锚点到当前的范围（升序两端的闭区间） */
export function rangeBetween(anchorIndex: number, currentIndex: number): [number, number] {
  return anchorIndex <= currentIndex ? [anchorIndex, currentIndex] : [currentIndex, anchorIndex]
}

/** 按区间取 id 集合（Shift 单击 / Shift 方向键） */
export function idsInRange<Id>(ids: readonly Id[], anchorIndex: number, currentIndex: number): Set<Id> {
  const [start, end] = rangeBetween(anchorIndex, currentIndex)
  return new Set(ids.slice(start, end + 1))
}

/** 过滤 / 搜索换了 ids 之后，把已经不存在的选中项剔掉（否则会删到看不见的东西） */
export function pruneIds<Id>(selected: ReadonlySet<Id>, ids: readonly Id[]): Set<Id> {
  const visible = new Set(ids)
  const next = new Set<Id>()
  for (const id of selected) {
    if (visible.has(id)) next.add(id)
  }
  return next
}

/** 同一个集合（元素与数量一致）—— 用来避免无意义的 setState */
export function sameIdSet<Id>(a: ReadonlySet<Id>, b: ReadonlySet<Id>): boolean {
  if (a.size !== b.size) return false
  for (const id of a) {
    if (!b.has(id)) return false
  }
  return true
}

/** 焦点元素在列表里的下标（找不到返回 -1） */
export function indexOfId<Id>(ids: readonly Id[], id: Id | null): number {
  if (id === null) return -1
  return ids.findIndex((item) => item === id)
}

/** 量容器里第一行有几个元素：对比 offsetTop，不硬编码断点 */
export function measureColumns(container: HTMLElement | null): number {
  if (!container) return 1
  const items = Array.from(container.querySelectorAll<HTMLElement>('[data-list-item]'))
  if (items.length === 0) return 1
  const top = items[0].offsetTop
  let count = 0
  for (const item of items) {
    if (item.offsetTop !== top) break
    count += 1
  }
  return Math.max(1, count)
}

/** 键盘 → 动作。纯函数，方便单测「方向键只是移动焦点，不是打开 / 拖拽」 */
export function listKeyAction(
  key: string,
  options: {
    /** 当前项下标；-1 表示还没有焦点项 */
    index: number
    count: number
    columns: number
    shiftKey?: boolean
    /** 有选中项时 Delete 删选中，否则删焦点项 —— 这里只做判定 */
    hasSelection?: boolean
    /** 是否在网格视图 */
    grid?: boolean
    /** 平台是否 macOS（Ctrl+A / Meta+A 都认，这里只需知道有没有修饰键） */
  },
): ListKeyAction {
  const { index, count, columns, shiftKey = false, grid = false } = options
  if (count === 0) return null

  switch (key) {
    case 'ArrowDown':
      return { type: 'focus', index: grid ? gridIndex(index, 'ArrowDown', columns, count) : moveIndex(index, 1, count) }
    case 'ArrowUp':
      return { type: 'focus', index: grid ? gridIndex(index, 'ArrowUp', columns, count) : moveIndex(index, -1, count) }
    case 'ArrowLeft':
      return grid ? { type: 'focus', index: gridIndex(index, 'ArrowLeft', columns, count) } : null
    case 'ArrowRight':
      return grid ? { type: 'focus', index: gridIndex(index, 'ArrowRight', columns, count) } : null
    case 'Home':
      return { type: 'focus', index: 0 }
    case 'End':
      return { type: 'focus', index: count - 1 }
    case 'Enter':
      return index >= 0 ? { type: 'open' } : null
    case 'Delete':
    case 'Backspace':
      return { type: 'delete' }
    case 'F2':
      return { type: 'rename' }
    case 'Escape':
      return { type: 'clear' }
    default:
      // 空格刻意**不处理**：它是拖拽手柄的起拖键（dnd-kit KeyboardSensor），
      // 挂在卡片本体上会和拖拽抢手势。
      return shiftKey ? null : null
  }
}

/* ── Hook ───────────────────────────────────────────────── */

export function useListNavigation<Id extends number | string>({
  ids,
  columns,
  onOpen,
  onDelete,
  onRename,
  onContextMenu,
  enabled = true,
}: ListNavigationOptions<Id>): ListNavigation<Id> {
  const [focusedId, setFocusedId] = useState<Id | null>(null)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<Id>>(() => new Set<Id>())
  /** Shift 选区的起点 */
  const anchorRef = useRef<Id | null>(null)
  const containerRef = useRef<HTMLElement | null>(null)
  /** ids 的即时快照：事件里要读最新顺序（state 闭包会慢一拍） */
  const idsRef = useRef<readonly Id[]>(ids)
  idsRef.current = ids

  const domIdOf = useCallback((id: Id) => `list-item-${String(id)}`, [])

  const focusElement = useCallback(
    (id: Id) => {
      const element = document.getElementById(domIdOf(id))
      if (!element) return
      element.focus({ preventScroll: true })
      element.scrollIntoView({ block: 'nearest' })
    },
    [domIdOf],
  )

  const focusAt = useCallback(
    (index: number) => {
      const list = idsRef.current
      if (list.length === 0) return
      const next = list[clampIndex(index, list.length)]
      setFocusedId(next)
      focusElement(next)
    },
    [focusElement],
  )

  // 筛选 / 搜悬挂之后：选中项里已经不存在的剔掉，焦点项没了就落回 null
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = pruneIds(prev, ids)
      return sameIdSet(prev, next) ? prev : next
    })
    setFocusedId((prev) => (prev !== null && !ids.includes(prev) ? null : prev))
    if (anchorRef.current !== null && !ids.includes(anchorRef.current)) anchorRef.current = null
  }, [ids])

  /** 当前列数：显式给了就用，否则量容器第一行 */
  const resolveColumns = useCallback((): number => {
    if (typeof columns === 'number') return Math.max(1, columns)
    if (typeof columns === 'function') return Math.max(1, columns())
    return measureColumns(containerRef.current)
  }, [columns])

  const selectRange = useCallback(
    (from: Id, to: Id) => {
      const list = idsRef.current
      const fromIndex = indexOfId(list, from)
      const toIndex = indexOfId(list, to)
      if (fromIndex < 0 || toIndex < 0) return
      setSelectedIds(idsInRange(list, fromIndex, toIndex))
    },
    [],
  )

  const toggle = useCallback((id: Id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleClick = useCallback(
    (id: Id) => (event: React.MouseEvent) => {
      if (!enabled) {
        onOpen(id)
        return
      }
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        setFocusedId(id)
        anchorRef.current = id
        toggle(id)
        return
      }
      if (event.shiftKey) {
        event.preventDefault()
        const anchor = anchorRef.current
        if (anchor === null) {
          setSelectedIds(new Set([id]))
        } else {
          selectRange(anchor, id)
        }
        setFocusedId(id)
        return
      }
      // 桌面习惯：单击 = 选中这一项并打开（列表会立刻切走，选中态留给回来时看）
      setFocusedId(id)
      anchorRef.current = id
      setSelectedIds(new Set([id]))
      onOpen(id)
    },
    [enabled, onOpen, toggle, selectRange],
  )

  const handleContextMenu = useCallback(
    (id: Id) => (event: React.MouseEvent) => {
      if (!enabled) return
      event.preventDefault()
      event.stopPropagation()
      // 右键的项不在选中集里 → 选中集改成只有它（资源管理器 / Finder 的行为）
      let target = selectedIds
      if (!selectedIds.has(id)) {
        target = new Set([id])
        setSelectedIds(target)
      }
      setFocusedId(id)
      anchorRef.current = id
      const element = event.currentTarget as HTMLElement | null
      if (element) element.focus({ preventScroll: true })
      onContextMenu?.([...target], { x: event.clientX, y: event.clientY })
    },
    [enabled, onContextMenu, selectedIds],
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!enabled) return
      const list = idsRef.current
      if (list.length === 0) return
      const key = event.key
      const hasModifier = event.ctrlKey || event.metaKey

      if (hasModifier && (key === 'a' || key === 'A')) {
        event.preventDefault()
        setSelectedIds(new Set(list))
        return
      }

      // 菜单键 / Shift+F10：对焦点项（或选中集）弹菜单，坐标取元素中心
      if (key === 'ContextMenu' || (event.shiftKey && key === 'F10')) {
        event.preventDefault()
        const idsForMenu = selectedIds.size > 0 ? [...selectedIds] : focusedId !== null ? [focusedId] : []
        if (idsForMenu.length === 0) return
        const element = focusedId !== null ? document.getElementById(domIdOf(focusedId)) : null
        const rect = element?.getBoundingClientRect()
        const at = rect
          ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
          : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
        onContextMenu?.(idsForMenu, at)
        return
      }

      const grid = resolveColumns() > 1
      const index = indexOfId(list, focusedId)
      const action = listKeyAction(key, {
        index,
        count: list.length,
        columns: resolveColumns(),
        shiftKey: event.shiftKey,
        hasSelection: selectedIds.size > 0,
        grid,
      })
      if (!action) return

      switch (action.type) {
        case 'focus': {
          event.preventDefault()
          // Shift + 方向键：从锚点扩选，不打开
          if (event.shiftKey && focusedId !== null) {
            const next = list[action.index]
            const anchor = anchorRef.current ?? focusedId
            selectRange(anchor, next)
            setFocusedId(next)
            focusElement(next)
            return
          }
          focusAt(action.index)
          return
        }
        case 'open':
          event.preventDefault()
          if (focusedId !== null) onOpen(focusedId)
          return
        case 'delete': {
          event.preventDefault()
          const targets = selectedIds.size > 0 ? [...selectedIds] : focusedId !== null ? [focusedId] : []
          if (targets.length > 0) onDelete?.(targets)
          return
        }
        case 'rename':
          event.preventDefault()
          if (focusedId !== null) onRename?.(focusedId)
          return
        case 'clear':
          event.preventDefault()
          setSelectedIds(new Set<Id>())
          return
        default:
          return
      }
    },
    [
      domIdOf,
      enabled,
      focusAt,
      focusElement,
      focusedId,
      onContextMenu,
      onDelete,
      onOpen,
      onRename,
      resolveColumns,
      selectRange,
      selectedIds,
    ],
  )

  const itemProps = useCallback(
    (id: Id): ListItemHandlers => {
      const selected = selectedIds.has(id)
      return {
        id: domIdOf(id),
        tabIndex: focusedId === id || (focusedId === null && ids[0] === id) ? 0 : -1,
        'aria-selected': selected,
        ...(selected ? { 'data-selected': 'true' as const } : {}),
        'data-list-item': '',
        onFocus: () => setFocusedId(id),
        onClick: handleClick(id),
        onContextMenu: handleContextMenu(id),
      }
    },
    [domIdOf, focusedId, handleClick, handleContextMenu, ids, selectedIds],
  )

  const effectiveIds = useMemo(
    () => (selectedIds.size > 0 ? [...selectedIds] : focusedId !== null ? [focusedId] : []),
    [focusedId, selectedIds],
  )

  return {
    focusedId,
    selectedIds,
    containerProps: {
      ref: (element: HTMLElement | null) => {
        containerRef.current = element
      },
      onKeyDown: handleKeyDown,
      role: resolveColumns() > 1 ? 'grid' : 'listbox',
      'aria-multiselectable': true,
      tabIndex: -1,
      'data-list-nav': '',
    },
    itemProps,
    effectiveIds,
  }
}
