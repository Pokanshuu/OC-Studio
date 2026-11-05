'use client'

/**
 * 导出中心的**调用层**：别处只要「打开导出」就调 `useExportCenter()`，
 * 不用各自挂一个 `<ExportCenter>`、也不用知道里面有几个页签。
 *
 * ```tsx
 * const openExport = useExportCenter()
 * openExport({ tab: 'poster', subject: { kind: 'character', id } })
 * ```
 *
 * Provider 挂在 `AppShell` 里**一次**，全站共用同一个实例：
 * - 谁打开、打开哪一页、带什么范围（`subject` / `novelId`）都在请求里说清楚；
 * - 关闭（返回 / Esc）只改 Provider 的状态，调用方不需要维护 `open` 布尔值；
 * - 焦点回收、页签键盘、Portal 这些都在 `ExportCenter` 内部，调用方一件都不用管。
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { PosterSubjectKind } from '@/lib/export/poster/subjects'
import { ExportCenter, type ExportTabId } from './ExportCenter'

export interface ExportRequest {
  /** 落在哪一页签，缺省海报 */
  tab?: ExportTabId
  /** 小说：按小说根笔记的 id 打开（面板自己读章节） */
  novelId?: number
  /** 海报：直接落在这一条实体上 */
  subject?: { kind: PosterSubjectKind; id: number }
}

type OpenExport = (request?: ExportRequest) => void

const ExportRequestContext = createContext<OpenExport | null>(null)

export function ExportCenterProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ExportRequest | null>(null)
  /** 每次打开换一个 key，让导出中心从干净状态起来（不残留上次的页签 / 缩放） */
  const [session, setSession] = useState(0)

  const open = useCallback<OpenExport>((next) => {
    setRequest(next ?? {})
    setSession((value) => value + 1)
  }, [])
  const close = useCallback(() => setRequest(null), [])

  const value = useMemo(() => open, [open])

  return (
    <ExportRequestContext.Provider value={value}>
      {children}
      {request !== null ? (
        <ExportCenter
          key={session}
          onClose={close}
          initialTab={request.tab}
          initialSubject={request.subject}
          novelId={request.novelId}
        />
      ) : null}
    </ExportRequestContext.Provider>
  )
}

/** 拿到「打开导出」的入口。必须在 `ExportCenterProvider` 里用（AppShell 已经包好了）。 */
export function useExportCenter(): OpenExport {
  const open = useContext(ExportRequestContext)
  if (open === null) throw new Error('useExportCenter 必须在 ExportCenterProvider 内使用')
  return open
}
