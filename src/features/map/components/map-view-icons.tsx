'use client'

/**
 * 六档底图各自的图标 —— 只给**控制条上的档位**用（标签仍以 `MAP_VIEW_LABELS` 为准）。
 *
 * 为什么放在 features 而不是插件里：`plugins/map-generator` 是纯算法与数据，
 * 一个图标组件是界面资产，不该让插件边界依赖 lucide。
 *
 * 图形只表达「这一档看的是什么」，不承担选中态：选中还是靠浅底块（`aria-pressed`）。
 */
import {
  ChartSpline,
  CloudRain,
  Flag,
  Layers,
  Mountain,
  Thermometer,
  TreePine,
  type LucideIcon,
} from 'lucide-react'
import type { MapView } from '@/plugins/map-generator'

export const MAP_VIEW_ICONS: Record<MapView, LucideIcon> = {
  terrain: Mountain,
  contour: Layers,
  temperature: Thermometer,
  moisture: CloudRain,
  biome: TreePine,
  political: Flag,
  // 剖面只出现在抽屉里，不占控制条档位
  profile: ChartSpline,
}
