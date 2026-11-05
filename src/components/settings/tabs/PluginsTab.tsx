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
import { ROUND_ITEM } from '@/lib/ui-tokens'

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
            <div key={plugin.id} className="flex flex-col border-b border-line last:border-b-0">
              {/* 悬停单位是**整行**（复选框 / 名字 / 版本号一起亮），不是中间那截按钮：
                  否则全局 `button:hover` 只给 flex-1 的那块铺底色，行看着被切成两半。 */}
              <div
                onClick={(event) => {
                  // 复选框与名字按钮自己处理点击；只有点空白和版本号才落到行上
                  if ((event.target as HTMLElement).closest('button')) return
                  setExpanded(open ? null : plugin.id)
                }}
                className={`${ROUND_ITEM} flex items-center gap-2 py-2 transition-colors hover:bg-[var(--oc-hover)]`}
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
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : plugin.id)}
                  className="min-w-0 flex-1 text-left hover:bg-transparent"
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

      {/* 插件还没开放安装入口：这里只占位说明，不做成按钮（点了也只会弹提示） */}
      <div className="flex items-center gap-1.5 text-[13px] text-ink-faint">
        <Plus size={13} strokeWidth={2} />
        <span>添加插件</span>
        <span className="text-[11px]">开发中</span>
      </div>
    </div>
  )
}
