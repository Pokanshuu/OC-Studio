'use client'

/**
 * 列表里的一个分组：可折叠的组标题 + 组内条目。
 *
 * 角色左栏与自定义分类列表共用；折叠状态由调用方按**命名空间化的 key**
 * （`country:12` / `folder:甲` / `unassigned:folder`）保存，组件本身不记状态。
 * 视觉与原来的角色左栏分组头一致：13px 灰字、chevron 展开箭头、右侧命中数。
 */
import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { ROUND_ITEM } from '@/lib/ui-tokens'

interface ListGroupSectionProps {
  label: string
  /** 搜索后的命中数（不是整组总数） */
  count: number
  collapsed: boolean
  onToggle: () => void
  children: ReactNode
}

export function ListGroupSection({ label, count, collapsed, onToggle, children }: ListGroupSectionProps) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className={`flex w-full items-center gap-1 px-3 py-1.5 text-left text-[13px] text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink ${ROUND_ITEM}`}
      >
        <ChevronRight
          size={13}
          strokeWidth={2}
          className={`shrink-0 text-ink-muted transition-transform ${collapsed ? '' : 'rotate-90'}`}
        />
        <span className="flex-1 truncate">{label}</span>
        <span className="text-[11px] text-ink-faint">{count}</span>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-base ease-quiet ${
          collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mt-0.5">{children}</div>
        </div>
      </div>
    </div>
  )
}
