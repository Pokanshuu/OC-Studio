/**
 * 侧栏板块表 —— **唯一源**。
 *
 * 侧栏（`components/layout/Sidebar.tsx`）与命令面板（`components/layout/MenuBarSearch.tsx`）
 * 都从这里取：以前两边各写一份，面板那份还停在「角色 / 事件 / 国家 / 世界观 / 时间线 /
 * 关系图 / 相册」—— 后来加的**表格、地图、小说、工具插件**在面板里根本搜不到，
 * 空白态看起来像半年前的应用。新增板块只改这一处。
 *
 * 注意：
 * - `label` 就是 `activeItem` 的键（导航靠字符串，`lib/entry-kinds.ts` 管工具插件那份）
 * - 图标一律 lucide，`strokeWidth={2}` 由渲染方给
 * - **工具插件不写死在这里**：它们来自插件表（`usePlugins`），图标用 `toolIcon()`
 */
import {
  BookOpen,
  BookText,
  Calendar,
  Clock,
  Flag,
  GitBranch,
  House,
  Images,
  Map,
  Table2,
  Users,
  Wand2,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  icon: LucideIcon
}

export interface NavGroup {
  /** 分组标题，侧栏直接显示 */
  label: string
  items: NavItem[]
}

/** 分组顺序 = 侧栏从上到下的顺序 */
export const NAV_GROUPS: NavGroup[] = [
  { label: '图鉴', items: [{ label: '角色', icon: Users }, { label: '事件', icon: Calendar }, { label: '国家', icon: Flag }] },
  { label: '创作', items: [{ label: '世界观', icon: BookOpen }, { label: '小说', icon: BookText }] },
  {
    label: '视图',
    items: [
      { label: '表格', icon: Table2 },
      { label: '地图', icon: Map },
      { label: '时间线', icon: Clock },
      { label: '关系图', icon: GitBranch },
    ],
  },
]

/**
 * 主页（概览）。**只在侧栏用**：它的 `activeItem` 是 `null`，而命令面板的每一项
 * 都是「把 `activeItem` 设成这个字符串」—— 面板里放一条「主页」只会设成字符串
 * `'主页'`，落到「功能正在开发中」。所以面板不要收它（2026-11-08 撤掉）。
 */
export const HOME_ITEM: NavItem = { label: '主页', icon: House }

/** 相册固定在侧栏底部，但它是可以跳的页面 */
export const ALBUM_ITEM: NavItem = { label: '相册', icon: Images }

/** 命令面板「切换板块」：三个分组 + 相册，顺序照侧栏（**不含主页**，见上） */
export function sectionCommands(): NavItem[] {
  return [...NAV_GROUPS.flatMap((group) => group.items), ALBUM_ITEM]
}

/** 工具插件在侧栏 / 命令面板的图标（插件 id → lucide 图标）；没登记的一律扳手 */
const TOOL_ICONS: Record<string, LucideIcon> = {
  'official.map-generator': Wand2,
}

export function toolIcon(pluginId: string): LucideIcon {
  return TOOL_ICONS[pluginId] ?? Wrench
}
