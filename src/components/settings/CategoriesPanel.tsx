'use client'

/**
 * 设置 › 世界 › 自定义分类（管理入口）。
 *
 * 表单本身在 `features/categories/CategoryDialog` —— 侧栏「新建分类」/ 右键「编辑分类」
 * 用的是同一个弹窗。这里只是把列表列出来，避免出现「设置里一套表单、侧栏另一套」。
 *
 * 内置分类（宠物 / 武器）**默认关闭**：行尾是开关，打开后侧栏才出现入口；
 * 名字 / 图标 / 模板是出厂定义，不在这里改（要改就复制成自建分类）。
 */
import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { updateCategory, useCategories } from '@/lib/categories/store'
import { useTemplates } from '@/lib/templates/store'
import { categoryIconOf } from '@/lib/categories/icons'
import type { Category } from '@/lib/categories/types'
import { CategoryDialog } from '@/features/categories/CategoryDialog'
import { importLegacyCharacters, legacyKindCount } from '@/features/categories/legacy-import'
import { notifyDataUpdated } from '@/lib/data-events'
import { SWITCH_CLASSES, SWITCH_DOT } from '@/components/settings/controls'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { BTN_QUIET } from '@/lib/ui-tokens'

export function CategoriesPanel() {
  const categories = useCategories()
  const { templates } = useTemplates()
  const [dialog, setDialog] = useState<
    { mode: 'create' } | { mode: 'edit'; category: Category } | null
  >(null)
  const [legacy, setLegacy] = useState({ total: 0, weapon: 0, pet: 0 })
  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    void legacyKindCount().then(setLegacy).catch(() => undefined)
  }, [])

  /** 分类里存的是模板 id（`entry`），界面上要显示模板名（「词条」） */
  const templateName = (id: string): string => templates.find((doc) => doc.id === id)?.name ?? id

  const toggleBuiltin = (category: Category): void => {
    void updateCategory(category.id, { enabled: !category.enabled })
      .then(() => notifyDataUpdated())
      .catch((err: unknown) => {
        toast.error('保存失败', { description: String(err) })
      })
  }

  const runLegacyImport = (): void => {
    setImporting(true)
    void importLegacyCharacters()
      .then(async (result) => {
        setLegacy(await legacyKindCount())
        notifyDataUpdated()
        toast.success(`已导入 ${result.imported} 条`, {
          description: result.skipped > 0 ? `跳过 ${result.skipped} 条同名条目` : undefined,
        })
        setImportOpen(false)
      })
      .catch((err: unknown) => {
        toast.error('导入失败', { description: String(err) })
      })
      .finally(() => setImporting(false))
  }

  return (
    <div className="flex flex-col">
      {categories.length === 0 ? (
        <p className="py-3 text-[12px] text-ink-faint">还没有分类</p>
      ) : (
        categories.map((category) => {
          const Icon = categoryIconOf(category.icon)
          const row = (
            <>
              <Icon size={14} strokeWidth={2} className="shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1 truncate">{category.name}</span>
              <span className="shrink-0 text-[11px] text-ink-faint">
                {category.builtin ? '内置' : templateName(category.template)}
              </span>
            </>
          )
          return (
            <div
              key={category.id}
              className="flex items-center gap-2 border-b border-line py-2 text-sm text-ink"
            >
              {category.builtin ? (
                <div className="flex min-w-0 flex-1 items-center gap-2">{row}</div>
              ) : (
                <button
                  type="button"
                  onClick={() => setDialog({ mode: 'edit', category })}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-item px-1 text-left transition-colors hover:bg-[var(--oc-hover)]"
                >
                  {row}
                </button>
              )}
              {category.builtin ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={category.enabled}
                  aria-label={`${category.name}是否显示在侧栏`}
                  onClick={() => toggleBuiltin(category)}
                  className={`${SWITCH_CLASSES.base} ${category.enabled ? SWITCH_CLASSES.on : SWITCH_CLASSES.off}`}
                >
                  <span
                    className={`${SWITCH_DOT} ${
                      category.enabled ? 'translate-x-[18px] bg-paper' : 'translate-x-[2px]'
                    }`}
                  />
                </button>
              ) : null}
            </div>
          )
        })
      )}

      {legacy.total > 0 ? (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="text-[12px] text-ink-muted">旧武器 / 宠物角色 · {legacy.total}</span>
          <button type="button" onClick={() => setImportOpen(true)} className={BTN_QUIET}>
            导入
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setDialog({ mode: 'create' })}
        className={`${BTN_QUIET} mt-3 self-start`}
      >
        <Plus size={13} strokeWidth={2} />
        新建分类
      </button>

      <CategoryDialog
        open={dialog !== null}
        category={dialog?.mode === 'edit' ? dialog.category : undefined}
        onClose={() => setDialog(null)}
      />

      <AlertDialog open={importOpen} onOpenChange={setImportOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>导入旧武器 / 宠物角色</AlertDialogTitle>
            <AlertDialogDescription>会复制为分类条目，原角色保留。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={importing}
              onClick={(event) => {
                event.preventDefault()
                runLegacyImport()
              }}
            >
              {importing ? '导入中…' : '导入'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
