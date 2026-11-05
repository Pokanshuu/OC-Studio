'use client'

/**
 * 列表 / 书架 / 相册的空态：**一个图标 + 一句话 + 一个主按钮**（`BTN_PRIMARY`）。
 *
 * - 图标是**必需**的（20px lucide、`strokeWidth={2}`、`text-ink-faint`）：只有一句话时，
 *   「还没有内容」和「加载失败」看起来是一样的；有的空态带图标、有的不带，就不算一套。
 * - 动作是按钮，不是可点的衬线小字：空态里的「新建 / 创建第一个」是这一页唯一的入口，
 *   写成文字链接在深色底上几乎看不出能点。
 * - 整块居中（横 + 纵）。要真居中，父级必须给出高度：放在 `ListShell` 滚动容器里的那一层加 `flex-1`，
 *   放在 `fill` 分栏里的那一层也是 `flex-1`；否则它只会缩成一行字贴在顶上。
 * - 没有动作时（筛选无结果）只渲染图标 + 一句话。
 */
import type { LucideIcon } from 'lucide-react'
import { BTN_PRIMARY, EMPTY_STATE } from '@/lib/ui-tokens'

interface ListEmptyStateProps {
  /** 定性用的图标（lucide 组件本身，不是节点）：书本 / 人群 / 旗帜 / 放大镜… */
  icon: LucideIcon
  /** 一句事实（「还没有角色」「没有匹配的事件」） */
  message: string
  /** 可选动作（创建 / 清除筛选） */
  action?: { label: string; onClick: () => void }
  className?: string
}

export function ListEmptyState({ icon: Icon, message, action, className = '' }: ListEmptyStateProps) {
  return (
    <div className={`${EMPTY_STATE} ${className}`}>
      <Icon size={20} strokeWidth={2} className="text-ink-faint" aria-hidden />
      <p className="text-sm text-ink-muted">{message}</p>
      {action ? (
        <button type="button" onClick={action.onClick} className={BTN_PRIMARY}>
          {action.label}
        </button>
      ) : null}
    </div>
  )
}
