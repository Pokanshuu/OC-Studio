'use client'

/**
 * 分类弹窗（新建 / 编辑）—— **不挂在设置里**。
 *
 * 侧栏「新建分类」和分类项的右键「编辑」都直接开这个弹窗：分类是导航结构的一部分，
 * 让用户先钻进「设置 › 世界 › 自定义分类」再绕回来，纯属多余。
 * 设置里的列表仍然复用它，两处只有一份表单。
 *
 * 版式：**头 / 尾固定，中间一段自己滚**。分类有 37 个图标，整块面板跟着滚的话，
 * 标题和「创建」会一起被推出视口（手机上尤其明显）。
 */
import {
  createElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useTemplates } from '@/lib/templates/store'
import { noteTemplates } from '@/lib/templates/note'
import { createCategory, deleteCategory, updateCategory, useCategories } from '@/lib/categories/store'
import { renameCategoryEntries } from '@/features/world/services'
import { notifyDataUpdated } from '@/lib/data-events'
import { useSettingsTrigger } from '@/components/layout/SettingsTriggerContext'
import {
  CATEGORY_ICON_NAMES,
  DEFAULT_CATEGORY_ICON,
  categoryIconLabel,
  categoryIconOf,
  type CategoryIcon,
} from '@/lib/categories/icons'
import type { Category } from '@/lib/categories/types'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  ADD_ACTION,
  BTN_DANGER,
  BTN_PRIMARY,
  BTN_QUIET,
  FIELD_LABEL_BLOCK,
  ICON_BTN,
  INPUT_LINE,
  PANEL,
  PAGE_TITLE,
  ROUND_CONTROL,
  ROUND_ITEM,
} from '@/lib/ui-tokens'

interface CategoryDialogProps {
  open: boolean
  /** 传了就是编辑，没传就是新建 */
  category?: Category
  onClose: () => void
  /** 新建成功后回调（侧栏用它跳到新分类） */
  onCreated?: (category: Category) => void
  /** 删除成功后回调 */
  onDeleted?: (id: string) => void
}

export function CategoryDialog({ open, category, onClose, onCreated, onDeleted }: CategoryDialogProps) {
  if (!open) return null
  return (
    <CategoryDialogBody
      key={category?.id ?? 'new'}
      category={category}
      onClose={onClose}
      onCreated={onCreated}
      onDeleted={onDeleted}
    />
  )
}

function CategoryDialogBody({ category, onClose, onCreated, onDeleted }: Omit<CategoryDialogProps, 'open'>) {
  const { templates } = useTemplates()
  const selectableTemplates = noteTemplates(templates, category?.template)
  const categories = useCategories()
  const { openSettings } = useSettingsTrigger()
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState<CategoryIcon>(category?.icon ?? DEFAULT_CATEGORY_ICON)
  const [template, setTemplate] = useState(category?.template ?? 'entry')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [iconOpen, setIconOpen] = useState(false)
  const [iconAnchor, setIconAnchor] = useState<{ left: number; top: number; bottom: number } | null>(null)
  const [iconPos, setIconPos] = useState<{ left: number; top: number } | null>(null)

  const isNew = category === undefined
  const titleId = useId()
  const nameId = useId()
  const errorId = useId()
  const templateGroup = useId()
  const iconPanelId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const iconTriggerRef = useRef<HTMLButtonElement>(null)
  const iconPanelRef = useRef<HTMLDivElement>(null)
  const skipRestoreRef = useRef(false)

  /** 打开时聚焦名称、关掉时把焦点还给打开它的那个按钮；改名时全选，直接输入就是替换 */
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    nameRef.current?.focus()
    if (!isNew) nameRef.current?.select()
    // 跳去设置（新建模板）时不还焦点：焦点要留给设置弹窗
    return () => {
      if (!skipRestoreRef.current) previous?.focus()
    }
  }, [isNew])

  /** Esc：先收图标选择器，再关弹窗。确认删除的 AlertDialog 开着时交给它自己处理 */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // 中文输入法里 Esc 是「取消候选」，不能顺手把弹窗也关掉
      if (event.key !== 'Escape' || event.isComposing || busy) return
      if (iconOpen) {
        setIconOpen(false)
        iconTriggerRef.current?.focus()
        return
      }
      if (document.querySelector('[data-slot="alert-dialog-content"]') !== null) return
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, iconOpen, onClose])

  /** 模态焦点圈：Tab 到底回到第一个，别把焦点漏到遮罩后面的侧栏 */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab' || panelRef.current === null) return
      if (document.querySelector('[data-slot="alert-dialog-content"]') !== null) return
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  /** 图标选择器：点外部关闭 */
  useEffect(() => {
    if (!iconOpen) return
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (iconPanelRef.current?.contains(target) === true) return
      if (iconTriggerRef.current?.contains(target) === true) return
      setIconOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [iconOpen])

  /** 图标选择器：先按锚点渲染，再在绘制前夹进视口（下方不够就往上翻） */
  useLayoutEffect(() => {
    if (!iconOpen || iconPanelRef.current === null || iconAnchor === null) return
    const rect = iconPanelRef.current.getBoundingClientRect()
    let left = iconAnchor.left
    let top = iconAnchor.bottom
    if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8
    if (top + rect.height > window.innerHeight - 8) top = iconAnchor.top - rect.height - 6
    setIconPos({ left: Math.max(8, left), top: Math.max(8, top) })
  }, [iconOpen, iconAnchor])

  /** 打开后把焦点放进网格（选中项优先），键盘才能直接选 */
  useEffect(() => {
    if (!iconOpen) return
    const panel = iconPanelRef.current
    if (panel === null) return
    const selected = panel.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
    ;(selected ?? panel.querySelector<HTMLButtonElement>('button'))?.focus()
  }, [iconOpen])

  const toggleIconPicker = (): void => {
    if (iconOpen) {
      setIconOpen(false)
      return
    }
    const rect = iconTriggerRef.current?.getBoundingClientRect()
    if (!rect) return
    setIconAnchor({ left: rect.left, top: rect.top, bottom: rect.bottom + 6 })
    setIconPos(null)
    setIconOpen(true)
  }

  const chooseIcon = (iconName: CategoryIcon): void => {
    setIcon(iconName)
    setIconOpen(false)
    iconTriggerRef.current?.focus()
  }

  /** 方向键在 8 列网格里移动；Tab 收起选择器并回到触发按钮 */
  const onIconKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key === 'Tab') {
      event.preventDefault()
      setIconOpen(false)
      iconTriggerRef.current?.focus()
      return
    }
    const columns = 8
    let next = index
    if (event.key === 'ArrowLeft') next = index - 1
    else if (event.key === 'ArrowRight') next = index + 1
    else if (event.key === 'ArrowUp') next = index - columns
    else if (event.key === 'ArrowDown') next = index + columns
    else return
    event.preventDefault()
    if (next < 0 || next >= CATEGORY_ICON_NAMES.length) return
    iconPanelRef.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
  }

  const submit = async (): Promise<void> => {
    if (busy) return
    const next = name.trim()
    if (next === '') return
    // 编辑时也要查重：updateCategory 不做唯一性校验，重名会在下次读盘时被 normalize 吞掉一条
    if (categories.some((item) => item.name === next && item.id !== category?.id)) {
      setError(`已经有叫「${next}」的分类了`)
      return
    }
    setBusy(true)
    setError('')
    try {
      if (isNew) {
        const created = await createCategory({ name: next, icon, template })
        toast.success(`已新建分类「${next}」`)
        onCreated?.(created)
      } else {
        await updateCategory(category.id, { name: next, icon, template })
        // 笔记的归属键存的是分类名；改名时一起搬，否则这一类会从入口里消失
        if (!category.builtin && category.name !== next) {
          await renameCategoryEntries(category.name, next)
          notifyDataUpdated()
        }
        toast.success(`已保存「${next}」`)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (busy || isNew) return
    setBusy(true)
    try {
      await deleteCategory(category.id)
      notifyDataUpdated()
      toast.success(`已删除分类「${category.name}」`)
      onDeleted?.(category.id)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const overlayRoot = typeof document === 'undefined' ? null : document.getElementById('overlay-root')

  const content = (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[var(--oc-scrim)] p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex max-h-[85vh] w-[440px] max-w-full flex-col overflow-hidden ${PANEL}`}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-5">
          <h2 id={titleId} className={PAGE_TITLE}>
            {isNew ? '新建分类' : '编辑分类'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className={`${ICON_BTN} -mr-2 -mt-0.5`}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
          <div className="mb-5">
            <label htmlFor={nameId} className={FIELD_LABEL_BLOCK}>
              名称
            </label>
            <div className="flex items-center gap-2">
              <button
                ref={iconTriggerRef}
                type="button"
                onClick={toggleIconPicker}
                title="选择图标"
                aria-label={`选择图标（当前：${categoryIconLabel(icon)}）`}
                aria-haspopup="true"
                aria-expanded={iconOpen}
                aria-controls={iconOpen ? iconPanelId : undefined}
                className={`flex h-8 w-8 shrink-0 items-center justify-center bg-paper-card text-ink transition-colors hover:bg-line ${ROUND_CONTROL}`}
              >
                {createElement(categoryIconOf(icon), { size: 16, strokeWidth: 2 })}
              </button>
              <div className="min-w-0 flex-1">
                <input
                  ref={nameRef}
                  id={nameId}
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value)
                    if (error !== '') setError('')
                  }}
                  onKeyDown={(event) => {
                    // 中文输入法选词也是 Enter：候选没落定前不能提交
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) void submit()
                  }}
                  placeholder="例如：宠物"
                  aria-invalid={error !== ''}
                  aria-describedby={error !== '' ? errorId : undefined}
                  className={`${INPUT_LINE} h-8`}
                />
              </div>
            </div>
            {error !== '' ? (
              <p id={errorId} role="alert" className="mt-1.5 text-[12px] text-error">
                {error}
              </p>
            ) : null}
          </div>

          <div>
            <span id={`${titleId}-template`} className={FIELD_LABEL_BLOCK}>
              模板
            </span>
            <div role="radiogroup" aria-labelledby={`${titleId}-template`} className="flex flex-col rules-end">
              {selectableTemplates.map((doc) => {
                const selected = template === doc.id
                return (
                  <label
                    key={doc.id}
                    className={`row-rule flex cursor-pointer items-center gap-2.5 rounded-item px-2 py-2.5 text-[13px] transition-colors hover:bg-[var(--oc-hover)] has-[:focus-visible]:bg-[var(--oc-hover)] ${
                      selected ? 'text-ink' : 'text-ink-muted'
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        selected ? 'border-ink-muted' : 'border-line'
                      }`}
                    >
                      {selected ? <span className="h-2 w-2 rounded-full bg-ink-muted" /> : null}
                    </span>
                    <input
                      type="radio"
                      name={templateGroup}
                      value={doc.id}
                      checked={selected}
                      onChange={() => setTemplate(doc.id)}
                      className="sr-only"
                    />
                    <span className="min-w-0 flex-1 truncate">{doc.name}</span>
                  </label>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                skipRestoreRef.current = true
                onClose()
                openSettings('world', 'templates')
              }}
              className={`${ADD_ACTION} mt-1 pl-2`}
            >
              <Plus size={13} strokeWidth={2} />
              新建模板
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-line px-5 py-3">
          {isNew ? null : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button type="button" disabled={busy} className={BTN_DANGER}>
                  <Trash2 size={13} strokeWidth={2} />
                  删除
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>删除分类</AlertDialogTitle>
                  <AlertDialogDescription>分类里的笔记会保留，回到世界观目录。</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void remove()}>删除</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onClose} className={BTN_QUIET}>
              取消
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || name.trim() === ''}
              className={BTN_PRIMARY}
            >
              {isNew ? <Plus size={14} strokeWidth={2} /> : <Check size={14} strokeWidth={2} />}
              {busy ? (isNew ? '创建中…' : '保存中…') : isNew ? '创建' : '保存'}
            </button>
          </div>
        </div>
      </div>

      {iconOpen && iconAnchor ? (
        <div
          ref={iconPanelRef}
          id={iconPanelId}
          role="group"
          aria-label="选择图标"
          className={`fixed z-[60] grid w-[300px] max-w-[calc(100vw-1rem)] grid-cols-8 gap-1 p-2 ${PANEL}`}
          style={{ left: iconPos?.left ?? iconAnchor.left, top: iconPos?.top ?? iconAnchor.bottom }}
        >
          {CATEGORY_ICON_NAMES.map((iconName, index) => {
            const selected = icon === iconName
            const label = categoryIconLabel(iconName)
            return (
              <button
                key={iconName}
                type="button"
                onClick={() => chooseIcon(iconName)}
                onKeyDown={(event) => onIconKeyDown(event, index)}
                title={label}
                aria-label={label}
                aria-pressed={selected}
                className={`flex h-8 w-8 items-center justify-center transition-colors ${ROUND_ITEM} ${
                  selected ? 'bg-ink text-paper' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {createElement(categoryIconOf(iconName), { size: 16, strokeWidth: 2 })}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )

  return overlayRoot ? createPortal(content, overlayRoot) : content
}
