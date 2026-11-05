'use client'

import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { ImagePlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useSettings } from '@/lib/settings'
import { useDevice } from '@/lib/use-device'
import { isTauri as isTauriEnv } from '@/lib/env'
import { compressBackgroundImage, BACKGROUND_MAX_SCRIM, BACKGROUND_MIN_SCRIM, type BackgroundMode } from '@/lib/theme/background'
import { BTN_QUIET } from '@/lib/ui-tokens'
import { getVaultSession } from '@/lib/vault/vault-session'
import { isVaultSupported, vaultFs } from '@/lib/vault/vault-fs'
import { ThemeRadio, ThemePresetRadio, LayoutRadio, CoverTintRadio, SWITCH_CLASSES, SWITCH_DOT } from '../controls'
import { THEME_PRESETS } from '@/lib/theme/presets'
export function GeneralTab() {
  const { settings, updateSetting } = useSettings()
  const { isMobile } = useDevice()
  const [blurEnabled, setBlurEnabled] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("blur-effect-enabled") === "true"
  })
  const [blurSupported, setBlurSupported] = useState(false)

  const backgroundInputRef = useRef<HTMLInputElement>(null)

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
  return (
    <>
              <div className="flex flex-col gap-5">
                <label className="flex items-center justify-between">
                  {/* 禁用态由 opacity + 光标表达，不再补「桌面端支持」这类次级标签 */}
                  <span className="text-sm text-ink">开机自启动</span>
                  <button
                    role="switch"
                    aria-checked={settings.autoStart}
                    disabled={isMobile}
                    onClick={() =>
                      updateSetting("autoStart", !settings.autoStart)
                    }
                    className={`${SWITCH_CLASSES.base} ${
                      settings.autoStart ? SWITCH_CLASSES.on : SWITCH_CLASSES.off
                    } ${isMobile ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span
                      className={`${SWITCH_DOT} ${
                        settings.autoStart
                          ? "translate-x-[18px] bg-paper"
                          : "translate-x-[2px]"
                      }`}
                    />
                  </button>
                </label>

                <div className="flex flex-col gap-2">
                  <span className="text-sm text-ink">显示模式</span>
                  <ThemeRadio
                    value={settings.theme}
                    onChange={(v) =>
                      updateSetting("theme", v as "light" | "dark" | "auto")
                    }
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm text-ink">编辑界面样式</span>
                  <LayoutRadio
                    value={settings.editorLayout}
                    onChange={(v) => updateSetting("editorLayout", v)}
                  />
                </div>

                <div className="flex flex-col gap-3 pt-2 border-t border-line">
                  <label className="flex items-center justify-between">
                    <span className="text-sm text-ink">启用窗口模糊效果</span>
                    <button
                      role="switch"
                      aria-checked={blurEnabled}
                      disabled={toggleDisabled || settings.backgroundImage !== ''}
                      onClick={handleBlurToggle}
                      className={`${SWITCH_CLASSES.base} ${
                        blurEnabled ? SWITCH_CLASSES.on : SWITCH_CLASSES.off
                      } ${toggleDisabled || settings.backgroundImage !== '' ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <span
                        className={`${SWITCH_DOT} ${
                          blurEnabled
                            ? "translate-x-[18px] bg-paper"
                            : "translate-x-[2px]"
                        }`}
                      />
                    </button>
                  </label>
                  {settings.backgroundImage !== '' ? (
                    <span className="text-[11px] text-ink-faint">与背景图互斥</span>
                  ) : null}
                </div>
              </div>

    </>
  )
}



