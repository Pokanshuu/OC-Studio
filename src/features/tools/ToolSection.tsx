'use client'

/**
 * 「工具」分区的容器：按 `工具:<插件 id>` 找插件，渲染它那块面板。
 *
 * 分工照 `docs/插件.md`：**壳在宿主，内容在插件**。宿主只做三件事 ——
 * 认 id、挡掉不可用的插件、给一块容器；插件自己往里画。
 * 以后换成 iframe 沙箱，变的只是这里怎么加载，插件的界面代码不动。
 */
import { Wrench } from 'lucide-react'
import { findPlugin, isPluginActive } from '@/lib/plugins'
import { toolIdFromItem } from '@/lib/entry-kinds'
import { MAP_GENERATOR_PLUGIN } from '@/lib/plugins/official'
import { CENTER_STATE } from '@/lib/ui-tokens'
import { MapToolView } from './MapToolView'

export function ToolSection({ item }: { item: string }) {
  const pluginId = toolIdFromItem(item)
  const manifest = findPlugin(pluginId)

  if (!manifest || !isPluginActive(manifest)) {
    return (
      <div className={CENTER_STATE}>
        <Wrench size={20} strokeWidth={2} className="text-ink-faint" />
        <p className="text-sm text-ink-muted">这个工具还没装好</p>
      </div>
    )
  }

  // 插件视图的接线表：id → 组件。加一个工具就是在这里加一行。
  if (manifest.id === MAP_GENERATOR_PLUGIN.id) return <MapToolView />

  return (
    <div className={CENTER_STATE}>
      <Wrench size={20} strokeWidth={2} className="text-ink-faint" />
      <p className="text-sm text-ink-muted">这个工具还没有界面</p>
    </div>
  )
}
