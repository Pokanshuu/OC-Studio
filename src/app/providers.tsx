'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect, type ReactNode } from 'react'
import { toast } from 'sonner'
import { initImageService } from '@/lib/image-service'

/**
 * 变更失败的**最后一道兜底**。
 *
 * 十三个 `useMutation` 全都没有 `onError`：写库失败时 `mutateAsync` 的 reject 只被
 * 少数调用点 catch 过，其余地方是「点了没反应」（`use-entity-workspace` 里那句
 * 「error handled via hook」其实 hook 里什么都没有）。
 *
 * 在 QueryClient 的默认 options 上统一挂一个：任何没自己处理过的变更失败都会说话。
 * 自己 catch 并给了提示的地方会再弹一次，所以这里按「同一句话 1.5 秒内只报一次」去重。
 */
const reported = new Map<string, number>()

function reportMutationError(error: unknown): void {
  const key = (error instanceof Error ? error.message : String(error)).trim()
  const now = Date.now()
  const last = reported.get(key) ?? 0
  if (now - last < 1500) return
  reported.set(key, now)
  if (reported.size > 50) reported.clear()
  toast.error('操作没有完成', { description: key === '' ? '发生了未知错误' : key })
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: {
            onError: reportMutationError,
          },
        },
      }),
  )

  useEffect(() => {
    initImageService().catch((err) => {
      console.warn('[Providers] initImageService failed:', err)
    })
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
