'use client'

/**
 * 编辑页头里「保存」旁边的导出入口。
 *
 * **只调全局导出中心**（`openExportCenter`）—— 自己不拼任何导出管线：海报 / 网站 / 文档 /
 * 备份的版式、参数、预览都在 `components/shared/export/` 那边，这里只负责「带着这条实体进去」。
 *
 * 落在**海报**页签：全局导出里只有海报是「一条实体出一张图」的东西；
 * 网站 / 文档是整库的产物，进去之后仍然可以切（页签都在面板里）。
 *
 * `onBeforeOpen` 先保存再打开：海报读的是**已落库**的那一条，不先存就会导出一份旧内容
 * （和 `TalkToAgentButton` 同一个口径）。
 */
import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { ICON_BTN_MD } from '@/lib/ui-tokens'
import type { PosterSubjectKind } from '@/lib/export/poster/subjects'
import { useExportCenter } from './export/ExportCenterHost'

export function EntityExportButton({
  kind,
  id,
  onBeforeOpen,
}: {
  kind: PosterSubjectKind
  id: number
  /** 打开导出中心之前先跑（通常是表单的保存） */
  onBeforeOpen?: () => void | Promise<void>
}) {
  const openExportCenter = useExportCenter()
  const [busy, setBusy] = useState(false)

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (busy) return
        setBusy(true)
        try {
          await onBeforeOpen?.()
        } finally {
          setBusy(false)
          openExportCenter({ tab: 'poster', subject: { kind, id } })
        }
      }}
      className={`${ICON_BTN_MD} disabled:opacity-40`}
      aria-label="导出海报"
      title="导出海报…"
    >
      <FileDown size={16} strokeWidth={2} />
    </button>
  )
}
