'use client'

/**
 * 新建文件夹 —— **居中弹窗**（「移到文件夹」菜单与文件夹条的共用入口）。
 *
 * 文件夹本身只是角色上的一个名字；空文件夹靠 `.ocstudio/folders.json` 清单留住
 * （见 `../folders.ts`）。重名在这里就拦下，不让用户建完才发现没反应。
 */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { FolderPlus } from 'lucide-react'
import { BTN_PRIMARY, BTN_QUIET, FIELD_LABEL_BLOCK, INPUT_LINE, PAGE_TITLE, PANEL } from '@/lib/ui-tokens'
import { isImeComposing } from '@/lib/ime'

interface NewFolderDialogProps {
  open: boolean
  /** 已存在的文件夹名（重名直接拦下） */
  existing: string[]
  onClose: () => void
  onCreate: (name: string) => void | Promise<void>
}

export function NewFolderDialog({ open, existing, onClose, onCreate }: NewFolderDialogProps) {
  if (!open) return null
  return <NewFolderDialogBody existing={existing} onClose={onClose} onCreate={onCreate} />
}

function NewFolderDialogBody({ existing, onClose, onCreate }: Omit<NewFolderDialogProps, 'open'>) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const commit = async (): Promise<void> => {
    const name = draft.trim()
    if (name === '' || busy) return
    if (existing.some((folder) => folder.trim() === name)) {
      setError('已经有同名文件夹了')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onCreate(name)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const overlayRoot = typeof document === 'undefined' ? null : document.getElementById('overlay-root')
  if (overlayRoot === null) return null

  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[var(--oc-scrim)]"
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className={`flex w-[440px] flex-col p-6 max-md:w-[calc(100%-2rem)] ${PANEL}`}>
        <h2 className={`mb-1 flex items-center gap-2 ${PAGE_TITLE}`}>
          <FolderPlus size={16} strokeWidth={2} className="text-ink-muted" />
          新建文件夹
        </h2>

        <div className="mt-4">
          <label className={FIELD_LABEL_BLOCK}>名称</label>
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // 组字中的回车是「选候选词」，Esc 是「取消组字」，不是提交 / 关闭
              if (isImeComposing(event)) return
              if (event.key === 'Enter') void commit()
              if (event.key === 'Escape') onClose()
            }}
            className={INPUT_LINE}
          />
          {error ? <p className="mt-3 text-[12px] text-error">{error}</p> : null}
          <div className="mt-5 flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} className={BTN_QUIET}>
              取消
            </button>
            <button
              type="button"
              onClick={() => void commit()}
              disabled={busy || draft.trim() === ''}
              className={BTN_PRIMARY}
            >
              <span>{busy ? '新建中…' : '新建'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    overlayRoot,
  )
}

