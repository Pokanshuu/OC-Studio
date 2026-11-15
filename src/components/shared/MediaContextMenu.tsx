'use client'

/**
 * 图片 / 媒体卡片 / 列表项的统一点击坐标菜单。
 *
 * 口径：**单击看大图（或打开），桌面右键 / 移动端长按出菜单**（入口见 `lib/use-media-menu.ts`）。
 * 菜单项由调用方给；定位 / Portal / 点外部关闭 / Escape / 键盘 / 子菜单全部交给 `PointMenu`
 * （Base UI Menu + 虚拟锚点）。
 *
 * 支持**子菜单**（`submenu`）：「移到文件夹」这类动作的选项数量由用户数据决定，
 * 摊平进主菜单会把它撑成一张长表。子菜单现在可以键盘进（→ / ← / Esc 逐层关）。
 */
import { PointMenu, type PointMenuItem } from './menu/PointMenu'

export type MediaMenuItem = PointMenuItem

export function MediaContextMenu({
  at,
  items,
  onClose,
}: {
  at: { x: number; y: number }
  items: MediaMenuItem[]
  onClose: () => void
}) {
  return <PointMenu at={at} items={items} onClose={onClose} minWidth={128} />
}
