'use client'

/**
 * 「关系图操作」二级页：鼠标模式与连线样式。
 *
 * 它们是**关系图这一处的操作**，不是世界设定的一部分；原来在世界页里，
 * 现在跟「主题」一起落在个性化（外观 + 操作偏好都归这里）。
 */
import { useSettings } from '@/lib/settings'
import { EdgeStyleRadio, MouseModeRadio } from './controls'
import { SETTINGS_FIELD, SETTINGS_LABEL } from '@/lib/ui-tokens'

export function RelationsPanel() {
  const { settings, updateSetting } = useSettings()

  return (
    <div className="flex flex-col gap-5">
      <div className={SETTINGS_FIELD}>
        <span className={SETTINGS_LABEL}>鼠标</span>
        <MouseModeRadio value={settings.mouseMode} onChange={(v) => updateSetting('mouseMode', v)} />
      </div>
      <div className={SETTINGS_FIELD}>
        <span className={SETTINGS_LABEL}>连线</span>
        <EdgeStyleRadio value={settings.edgeStyle} onChange={(v) => updateSetting('edgeStyle', v)} />
      </div>
    </div>
  )
}
