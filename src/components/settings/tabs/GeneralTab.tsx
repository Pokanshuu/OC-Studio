'use client'

import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useSettings } from '@/lib/settings'
import { useDevice } from '@/lib/use-device'
import { isTauri as isTauriEnv } from '@/lib/env'
import { ThemeRadio, LayoutRadio, SWITCH_CLASSES, SWITCH_DOT } from '../controls'
import { SETTINGS_GROUP, SETTINGS_HINT, SETTINGS_LABEL, SETTINGS_ROW } from '@/lib/ui-tokens'
export function GeneralTab() {
  const { settings, updateSetting } = useSettings()
  const { isMobile } = useDevice()
  const [blurEnabled, setBlurEnabled] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("blur-effect-enabled") === "true"
  })
  const [blurSupported, setBlurSupported] = useState(false)

  const isTauri = isTauriEnv()

  const toggleDisabled = !isTauri || !blurSupported

  useEffect(() => {
    if (!isTauri) return
    try {
      // 只探测能力。别再用 init_blur(false) 当探针 —— 那会真的把当前的 Mica 关掉。
      invoke<boolean>('blur_supported').then((supported) => {
        if (supported === true) setBlurSupported(true)
      }).catch(() => {})
    } catch {}
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleBlurToggle = () => {
    if (toggleDisabled || settings.backgroundImage !== '') return
    const next = !blurEnabled
    setBlurEnabled(next)
    try { localStorage.setItem("blur-effect-enabled", String(next)) } catch {}
    try {
      invoke<boolean>("update_blur_effect", {
        enabled: next,
        isDark: document.documentElement.classList.contains("dark"),
      }).then((applied) => {
        document.documentElement.classList.toggle("tauri-mica", applied)
      }).catch(() => {})
    } catch {}
  }
  const switchRow = (label: React.ReactNode, checked: boolean, disabled: boolean, onToggle: () => void, extra?: React.ReactNode) => (
    <div className={SETTINGS_ROW}>
      <span className={SETTINGS_LABEL}>{label}</span>
      <div className="flex flex-col items-start gap-1">
        <button
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={onToggle}
          className={`${SWITCH_CLASSES.base} ${checked ? SWITCH_CLASSES.on : SWITCH_CLASSES.off} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <span className={`${SWITCH_DOT} ${checked ? "translate-x-[18px] bg-paper" : "translate-x-[2px]"}`} />
        </button>
        {extra}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {switchRow("开机自启动", settings.autoStart, isMobile, () => updateSetting("autoStart", !settings.autoStart))}
      <div className={SETTINGS_ROW}>
        <span className={SETTINGS_LABEL}>显示模式</span>
        <ThemeRadio
          value={settings.theme}
          onChange={(v) => updateSetting("theme", v as "light" | "dark" | "auto")}
        />
      </div>
      <div className={SETTINGS_ROW}>
        <span className={SETTINGS_LABEL}>编辑界面</span>
        <LayoutRadio
          value={settings.editorLayout}
          onChange={(v) => updateSetting("editorLayout", v)}
        />
      </div>
      <div className={SETTINGS_GROUP}>
        {switchRow(
          "窗口模糊",
          blurEnabled,
          toggleDisabled || settings.backgroundImage !== "",
          handleBlurToggle,
          settings.backgroundImage !== "" ? <span className={SETTINGS_HINT}>与背景图互斥</span> : null,
        )}
      </div>
    </div>
  )
}
