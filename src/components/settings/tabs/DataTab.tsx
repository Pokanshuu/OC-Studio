'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useImportExport } from '@/components/shared/ImportExportUI'
import { exportStaticSite } from '@/lib/export'
export function DataTab() {
  const { handleExport, handleImportClick, dialog } = useImportExport()
  const [publishing, setPublishing] = useState(false)

  async function handlePublish(): Promise<void> {
    if (publishing) return
    setPublishing(true)
    try {
      const filename = await exportStaticSite()
      toast.success(`已导出 ${filename}`, { description: '单文件静态站，改名 index.html 即可发布到任意静态托管' })
    } catch (error) {
      toast.error('发布失败', { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setPublishing(false)
    }
  }

  return (
    <>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleImportClick}
                    className="touch-feedback inline-flex h-8 items-center justify-center px-3 text-[13px] text-ink transition-colors hover:bg-[var(--oc-hover)]"
                  >
                    导入数据...
                  </button>
                  <button
                    onClick={handleExport}
                    className="touch-feedback inline-flex h-8 items-center justify-center px-3 text-[13px] text-ink transition-colors hover:bg-[var(--oc-hover)]"
                  >
                    导出所有数据 (JSON)
                  </button>
                  <button
                    onClick={() => void handlePublish()}
                    disabled={publishing}
                    className={`touch-feedback inline-flex h-8 items-center justify-center px-3 text-[13px] transition-colors hover:bg-[var(--oc-hover)] ${
                      publishing ? 'text-ink-faint cursor-not-allowed' : 'text-ink'
                    }`}
                  >
                    {publishing ? '正在生成…' : '发布为静态网站...'}
                  </button>
                  <p className="text-xs text-ink-faint mt-1">注：JSON 导出不含图片文件，仅包含文本数据；静态网站会把图片内联进单个 index.html</p>
                </div>
              </div>

      {dialog}
    </>
  )
}



