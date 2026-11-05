'use client'

/**
 * 文件夹的「堆」（卡片 / 画廊视图用）。
 *
 * 为什么不是 chip：文件夹在网格里是一个**容器**，不是一条筛选项。堆的形态
 * 直接说明「里面还有东西」，点进去才展开；chip 那种横排只适合目录视图
 * （`CharacterFolderBar`，那里一个文件夹就是一行筛选）。
 *
 * 交互：
 * - 单击 = 进入文件夹（由调用方切成「只看这个夹」）
 * - 右键 / 长按 = 重命名、管理内容、删除（菜单由调用方渲染）
 * - 堆上不出现常显按钮：动作一律走右键菜单，和卡片上的删除按钮区分开
 */
import type { ReactNode } from 'react'
import { Folder } from 'lucide-react'
import { ROUND_ITEM } from '@/lib/ui-tokens'

interface FolderStackProps {
  name: string
  count: number
  /** 成员封面（最多取前三张叠在正面；没有就显示文件夹图标） */
  covers?: string[]
  /** 卡片比例，默认 7:6（与实体封面卡一致） */
  aspect?: number
  /** 打开（进夹）：把点击事件交回去，宿主拿它算展开动画的原点 */
  onOpen: (event: React.MouseEvent<HTMLElement>) => void
  onContextMenu?: (event: React.MouseEvent) => void
  onLongPress?: () => void
  /** 右上角动作（移动端用动作表，桌面用右键；一般留空） */
  actions?: ReactNode
}

export function FolderStack({
  name,
  count,
  covers = [],
  aspect = 7 / 6,
  onOpen,
  onContextMenu,
  onLongPress,
  actions,
}: FolderStackProps) {
  const front = covers.filter(Boolean).slice(0, 1)[0]

  return (
    <div className="group relative touch-feedback">
      <button
        type="button"
        onClick={onOpen}
        onContextMenu={onContextMenu}
        onTouchStart={undefined}
        className="block w-full text-left"
        aria-label={`文件夹 ${name}，${count} 个`}
        {...(onLongPress ? { 'data-long-press': 'true' } : {})}
      >
        <div className="relative w-full" style={{ aspectRatio: String(aspect) }}>
          {/* 后层两张纸：只露出边缘，说明这是一叠而不是一张 */}
          <div className={`absolute inset-0 translate-x-1.5 -translate-y-1.5 bg-paper-card ${ROUND_ITEM}`} />
          <div className={`absolute inset-0 -translate-x-1 translate-y-1 bg-paper-card ${ROUND_ITEM}`} />

          <div className={`absolute inset-0 overflow-hidden bg-paper-card ${ROUND_ITEM}`}>
            {front ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={front} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" loading="lazy" />
            ) : (
              <div className="grid h-full w-full place-items-center">
                <Folder size={34} strokeWidth={1.5} className="text-ink-faint" />
              </div>
            )}
            {/* 底部压一层纸色，让「N 个」在图上可读 */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-paper-card to-transparent" />
          </div>

          <span className="absolute bottom-2 right-2.5 text-[11px] tracking-[0.08em] text-ink-muted">{count} 个</span>
        </div>
      </button>

      {actions ? (
        <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {actions}
        </div>
      ) : null}

      <div className="mt-2 text-center">
        <p className="truncate text-[13px] text-ink">{name}</p>
      </div>
    </div>
  )
}
