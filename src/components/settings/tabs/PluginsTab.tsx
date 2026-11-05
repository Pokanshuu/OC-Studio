'use client'

/**
 * 设置 › 插件。
 *
 * 三件事：**看见装了什么、开关它、看它要什么权限**。别的都后置。
 *
 * 三类插件的差别只写在一行类型标签上（功能 / 主题 / 技能）——用户不需要记
 * 「主题算不算插件」，他只需要知道「这东西也能在这儿关掉」。
 */
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'
import {
  PLUGIN_KIND_LABELS,
  PERMISSION_LABELS,
  grantedPermissions,
  setPermission,
  setPluginEnabled,
  usePlugins,
  type PluginManifest,
} from '@/lib/plugins'
import { BTN_QUIET, ICON_BTN, ROUND_ITEM, SECTION_TITLE } from '@/lib/ui-tokens'

function PermissionRow({ plugin, permission }: { plugin: PluginManifest; permission: PluginManifest['permissions'][number] }) {
  const granted = grantedPermissions(plugin).includes(permission)
  return (
    <button
      type="button"
      onClick={() => setPermission(plugin, permission, !granted)}
      className={`${ROUND_ITEM} flex items-center gap-1.5 px-1.5 py-0.5 text-[11px] transition-colors ${
        granted ? 'text-ink' : 'text-ink-faint hover:text-ink'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${granted ? 'bg-ink' : 'border border-line'}`}
        aria-hidden
      />
      {PERMISSION_LABELS[permission]}
    </button>
  )
}

export function PluginsTab() {
  const { plugins, enabled } = usePlugins()
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col">
        {plugins.map((plugin) => {
          const on = enabled(plugin)
          const open = expanded === plugin.id
          return (
            <div key={plugin.id} className="flex flex-col border-b border-line py-2 last:border-b-0">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={on}
                  onCheckedChange={(checked) => {
                    if (!plugin.available) return
                    setPluginEnabled(plugin, checked === true)
                  }}
                  aria-label={`启用 ${plugin.name}`}
                />
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : plugin.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className={`truncate text-sm ${plugin.available ? 'text-ink' : 'text-ink-faint'}`}>
                      {plugin.name}
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-faint">
                      {PLUGIN_KIND_LABELS[plugin.kind]}
                    </span>
                    {plugin.available ? null : (
                      <span className="shrink-0 text-[11px] text-ink-faint">开发中</span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-ink-faint">
                    {plugin.description}
                  </span>
                </button>
                <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">
                  {plugin.version}
                </span>
              </div>

              {open ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-7">
                  <span className="text-[11px] text-ink-faint">权限</span>
                  {plugin.permissions.map((permission) => (
                    <PermissionRow key={permission} plugin={plugin} permission={permission} />
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => toast('从文件安装插件还在做')}
          className={BTN_QUIET}
        >
          <Plus size={13} strokeWidth={2} />
          添加插件
        </button>
        <button
          type="button"
          onClick={() => toast('插件市场还没开')}
          className={`${ICON_BTN} w-auto px-2 text-[12px]`}
        >
          市场
        </button>
      </div>

      <section className="flex flex-col gap-1">
        <h3 className={SECTION_TITLE}>说明</h3>
        <p className="text-[11px] leading-relaxed text-ink-faint">
          功能插件给界面，主题插件只给颜色与背景，技能插件只给提示词。
        </p>
      </section>
    </div>
  )
}
