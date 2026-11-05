'use client'

/**
 * 设置 › 插件。
 *
 * 两件事：**看见装了什么、开关它**。展开不设内容 —— 作者署名放在主行，
 * 和类型挨着（2026-11-06：原先展开是一排权限开关，内置插件没有真实边界，
 * 反倒把「谁写的」挤掉了）。
 *
 * 三类插件的差别只写在一行类型标签上（功能 / 主题 / 技能）——用户不需要记
 * 「主题算不算插件」，他只需要知道「这东西也能在这儿关掉」。
 */
import { Plus } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { PLUGIN_KIND_LABELS, setPluginEnabled, usePlugins } from '@/lib/plugins'
import { ROUND_ITEM } from '@/lib/ui-tokens'

export function PluginsTab() {
  const { plugins, enabled } = usePlugins()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col">
        {plugins.map((plugin) => {
          const on = enabled(plugin)
          return (
            <div
              key={plugin.id}
              className="flex items-center gap-2 border-b border-line py-2 last:border-b-0"
            >
              <Checkbox
                checked={on}
                onCheckedChange={(checked) => {
                  if (!plugin.available) return
                  setPluginEnabled(plugin, checked === true)
                }}
                aria-label={`启用 ${plugin.name}`}
                className={ROUND_ITEM}
              />
              <div className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className={`truncate text-sm ${plugin.available ? 'text-ink' : 'text-ink-faint'}`}>
                    {plugin.name}
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-faint">
                    {PLUGIN_KIND_LABELS[plugin.kind]} · {plugin.author}
                  </span>
                  {plugin.available ? null : (
                    <span className="shrink-0 text-[11px] text-ink-faint">开发中</span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-ink-faint">
                  {plugin.description}
                </span>
              </div>
              <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">
                {plugin.version}
              </span>
            </div>
          )
        })}
      </div>

      {/* 插件还没开放安装入口：这里只占位说明，不做成按钮（点了也只会弹提示） */}
      <div className="flex items-center gap-1.5 text-[13px] text-ink-faint">
        <Plus size={13} strokeWidth={2} />
        <span>添加插件</span>
        <span className="text-[11px]">开发中</span>
      </div>
    </div>
  )
}
