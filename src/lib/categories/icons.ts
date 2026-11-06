/**
 * 分类可选的图标 —— **只收 app 里真的用得到的那些**，不是整本 lucide。
 *
 * 名字字符串存进 `categories.json`，渲染时从这张表取组件：
 * 这样文件里是可读的名字，也不怕 lucide 升级后导出名变化（变了就在这张表里补别名）。
 */
import {
  Archive,
  Award,
  BookOpen,
  Box,
  Briefcase,
  Castle,
  Cat,
  Compass,
  Crown,
  Dog,
  Drama,
  Flag,
  FlaskConical,
  Gem,
  Ghost,
  Globe,
  Hammer,
  Heart,
  Leaf,
  Map,
  Mountain,
  Music,
  Package,
  Palette,
  PawPrint,
  Scroll,
  Shield,
  Ship,
  Skull,
  Sparkles,
  Star,
  Swords,
  Tent,
  TreePine,
  Users,
  Wand2,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const CATEGORY_ICONS = {
  pawPrint: PawPrint,
  swords: Swords,
  shield: Shield,
  crown: Crown,
  users: Users,
  cat: Cat,
  dog: Dog,
  ghost: Ghost,
  skull: Skull,
  sparkles: Sparkles,
  star: Star,
  heart: Heart,
  gem: Gem,
  flask: FlaskConical,
  scroll: Scroll,
  book: BookOpen,
  map: Map,
  compass: Compass,
  mountain: Mountain,
  treePine: TreePine,
  leaf: Leaf,
  tent: Tent,
  castle: Castle,
  ship: Ship,
  hammer: Hammer,
  wand: Wand2,
  palette: Palette,
  music: Music,
  drama: Drama,
  briefcase: Briefcase,
  box: Box,
  package: Package,
  archive: Archive,
  globe: Globe,
  flag: Flag,
  award: Award,
  zap: Zap,
} as const

export type CategoryIcon = keyof typeof CATEGORY_ICONS

export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS) as CategoryIcon[]

/** 图标的中文名：只给 `title` / `aria-label` 用（文件里仍然存英文 key） */
export const CATEGORY_ICON_LABELS: Record<CategoryIcon, string> = {
  pawPrint: '爪印',
  swords: '双剑',
  shield: '盾牌',
  crown: '王冠',
  users: '人群',
  cat: '猫',
  dog: '狗',
  ghost: '幽灵',
  skull: '骷髅',
  sparkles: '星芒',
  star: '星',
  heart: '心',
  gem: '宝石',
  flask: '烧瓶',
  scroll: '卷轴',
  book: '书',
  map: '地图',
  compass: '罗盘',
  mountain: '山',
  treePine: '松树',
  leaf: '叶',
  tent: '帐篷',
  castle: '城堡',
  ship: '船',
  hammer: '锤',
  wand: '魔杖',
  palette: '调色板',
  music: '音乐',
  drama: '戏剧',
  briefcase: '公文包',
  box: '盒子',
  package: '包裹',
  archive: '档案',
  globe: '地球',
  flag: '旗帜',
  award: '奖章',
  zap: '闪电',
}

export function categoryIconLabel(name: CategoryIcon): string {
  return CATEGORY_ICON_LABELS[name] ?? name
}

export const DEFAULT_CATEGORY_ICON: CategoryIcon = 'sparkles'

/** 文件里读到的名字可能不认识（手改过 / 版本变化），统一收敛到一个安全值 */
export function normalizeCategoryIcon(raw: unknown): CategoryIcon {
  return typeof raw === 'string' && raw in CATEGORY_ICONS ? (raw as CategoryIcon) : DEFAULT_CATEGORY_ICON
}

export function categoryIconOf(name: CategoryIcon): LucideIcon {
  return CATEGORY_ICONS[name] ?? CATEGORY_ICONS[DEFAULT_CATEGORY_ICON]
}
