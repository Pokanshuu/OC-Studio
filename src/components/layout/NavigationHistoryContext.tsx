'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/**
 * 导航历史（后退 / 前进）。
 *
 * 在实体之间通过 `@` 引用和 `[[内链]]` 跳来跳去是这个应用的核心动作 ——
 * 跳过去以后必须能回来。原来只有「← 返回」按钮（而且只回到列表），没有前进。
 *
 * 栈里存的是**位置**，不是动作：
 * ```ts
 * { item: '角色' | '事件' | … | null, entity?: { type, id } }
 * ```
 * 谁改位置谁就调 `record()`；`setActiveItem`（切板块）、`navigateToEntity`（跨实体跳转）、
 * 各列表的「打开实体」**全部**经过同一个位置，所以记录点只有页面编排层的一处
 * （`lib/use-entity-workspace.ts` 的同步 effect），不需要每个入口各挂一次。
 *
 * 三条硬约束：
 * 1. **回放不再入栈**：`back()` 先把游标移到目标，`record()` 看到位置没变就不推栈。
 * 2. **不绕过未保存提示**：真正动栈之前先问 `guard`（由编排层注册成 `confirmLeave`）。
 * 3. **实体已被删除就继续退**：回放回调返回 `false` 表示「这条跳不过去」，这里再退一格。
 */

export interface NavLocation {
  /** 板块名（`activeItem`），主页是 null */
  item: string | null
  /** 打开着的实体（角色 / 事件 / 国家的编辑器） */
  entity?: { type: string; id: number }
}

const MAX_DEPTH = 50

interface NavigationHistoryValue {
  back: () => void
  forward: () => void
  canBack: boolean
  canForward: boolean
  /** 位置变化时由编排层调用（相同位置不入栈） */
  record: (location: NavLocation) => void
  /** 编排层注册回放：返回 false = 这条已经不存在，继续退 */
  setReplay: (replay: ((location: NavLocation) => boolean | Promise<boolean>) | null) => void
  /** 编排层注册「动栈前的守卫」（通常就是 confirmLeave） */
  setGuard: (guard: ((action: () => void) => void) | null) => void
}

const NavigationHistoryContext = createContext<NavigationHistoryValue>({
  back: () => {},
  forward: () => {},
  canBack: false,
  canForward: false,
  record: () => {},
  setReplay: () => {},
  setGuard: () => {},
})

export function useNavigationHistory(): NavigationHistoryValue {
  return useContext(NavigationHistoryContext)
}

function sameLocation(a: NavLocation | null, b: NavLocation | null): boolean {
  if (a === null || b === null) return a === b
  if (a.item !== b.item) return false
  if (!a.entity && !b.entity) return true
  if (!a.entity || !b.entity) return false
  return a.entity.type === b.entity.type && a.entity.id === b.entity.id
}

export function NavigationHistoryProvider({ children }: { children: ReactNode }) {
  const [backStack, setBackStack] = useState<NavLocation[]>([])
  const [forwardStack, setForwardStack] = useState<NavLocation[]>([])
  const currentRef = useRef<NavLocation | null>(null)
  const replayRef = useRef<((location: NavLocation) => boolean | Promise<boolean>) | null>(null)
  const guardRef = useRef<((action: () => void) => void) | null>(null)
  /** 递归「继续退」要拿到最新的 back / forward（回调里不能直接引用自己） */
  const backRef = useRef<(() => void) | null>(null)
  const forwardRef = useRef<(() => void) | null>(null)

  const record = useCallback((location: NavLocation) => {
    if (sameLocation(currentRef.current, location)) return
    const previous = currentRef.current
    currentRef.current = location
    if (previous === null) return
    setBackStack((stack) => {
      const next = [...stack, previous]
      return next.length > MAX_DEPTH ? next.slice(next.length - MAX_DEPTH) : next
    })
    setForwardStack([])
  }, [])

  const setReplay = useCallback((replay: ((location: NavLocation) => boolean | Promise<boolean>) | null) => {
    replayRef.current = replay
  }, [])

  const setGuard = useCallback((guard: ((action: () => void) => void) | null) => {
    guardRef.current = guard
  }, [])

  /** 回放一条；返回 false 表示目标已经不在了 */
  const apply = useCallback((location: NavLocation): boolean | Promise<boolean> => {
    const replay = replayRef.current
    if (!replay) return false
    return replay(location)
  }, [])

  const back = useCallback(() => {
    const run = (): void => {
      setBackStack((stack) => {
        if (stack.length === 0) return stack
        const target = stack[stack.length - 1]
        const rest = stack.slice(0, -1)
        const current = currentRef.current
        // 先把游标移过去，`record()` 就不会把这次回放当成一次新导航
        currentRef.current = target
        const result = apply(target)
        const commit = (applied: boolean): void => {
          if (!applied) {
            // 那条已经不在了：继续退（栈每次少一格，递归一定收敛）
            currentRef.current = target
            backRef.current?.()
            return
          }
          if (current !== null) setForwardStack((forward) => [...forward, current])
        }
        if (typeof result === 'boolean') commit(result)
        else void result.then(commit).catch(() => {})
        return rest
      })
    }
    if (guardRef.current) guardRef.current(run)
    else run()
  }, [apply])

  const forward = useCallback(() => {
    const run = (): void => {
      setForwardStack((stack) => {
        if (stack.length === 0) return stack
        const target = stack[stack.length - 1]
        const rest = stack.slice(0, -1)
        const current = currentRef.current
        currentRef.current = target
        const result = apply(target)
        const commit = (applied: boolean): void => {
          if (!applied) {
            forwardRef.current?.()
            return
          }
          if (current !== null) setBackStack((back) => [...back, current])
        }
        if (typeof result === 'boolean') commit(result)
        else void result.then(commit).catch(() => {})
        return rest
      })
    }
    if (guardRef.current) guardRef.current(run)
    else run()
  }, [apply])

  // 递归「继续退」需要拿到最新的 back / forward（回调里不能直接引用自己）
  useEffect(() => {
    backRef.current = back
    forwardRef.current = forward
  }, [back, forward])

  /* ── 快捷键：Alt+← / Alt+→（macOS 是 Cmd+[ / Cmd+]）+ 鼠标侧键 ──
     焦点在输入框 / 编辑器里时照样生效 —— 这两个组合不会被输入法占用。
     鼠标侧键在 WebView 里默认会触发「后退」历史，所以必须 preventDefault。 */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.key === 'ArrowLeft') {
        event.preventDefault()
        backRef.current?.()
        return
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.key === 'ArrowRight') {
        event.preventDefault()
        forwardRef.current?.()
        return
      }
      if (event.metaKey && !event.altKey && !event.ctrlKey) {
        if (event.key === '[') {
          event.preventDefault()
          backRef.current?.()
        } else if (event.key === ']') {
          event.preventDefault()
          forwardRef.current?.()
        }
      }
    }
    const onMouseUp = (event: MouseEvent): void => {
      // button 3 = 后退键，4 = 前进键（Windows / Linux 的大部分鼠标）
      if (event.button === 3) {
        event.preventDefault()
        backRef.current?.()
      } else if (event.button === 4) {
        event.preventDefault()
        forwardRef.current?.()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const value = useMemo<NavigationHistoryValue>(
    () => ({
      back,
      forward,
      canBack: backStack.length > 0,
      canForward: forwardStack.length > 0,
      record,
      setReplay,
      setGuard,
    }),
    [back, forward, backStack.length, forwardStack.length, record, setReplay, setGuard],
  )

  return <NavigationHistoryContext.Provider value={value}>{children}</NavigationHistoryContext.Provider>
}
