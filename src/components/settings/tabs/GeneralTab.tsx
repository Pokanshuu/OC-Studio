'use client'

import { useState, useEffect} from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useSettings } from '@/lib/settings'
import { useDevice } from '@/lib/use-device'
import { isTauri as isTauriEnv } from '@/lib/env'
import { ThemeRadio, SWITCH_CLASSES, SWITCH_DOT } from '../controls'
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
    if (toggleDisabled) return
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
                  <div className="flex flex-col">
                    <span className="text-sm text-ink">开机自启动</span>
                    {isMobile ? (
                      <span className="text-xs text-ink-faint">桌面端支持</span>
                    ) : null}
                  </div>
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
                  <span className="text-sm text-ink">主题</span>
                  <ThemeRadio
                    value={settings.theme}
                    onChange={(v) =>
                      updateSetting("theme", v as "light" | "dark" | "auto")
                    }
                  />
                </div>

                <div className="flex flex-col gap-3 pt-2 border-t border-line">
                  <label className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm text-ink">
                        启用窗口模糊效果
                      </span>
                      {isMobile ? (
                        <span className="text-xs text-ink-faint">桌面端支持</span>
                      ) : null}
                    </div>
                    <button
                      role="switch"
                      aria-checked={blurEnabled}
                      disabled={toggleDisabled}
                      onClick={handleBlurToggle}
                      className={`${SWITCH_CLASSES.base} ${
                        blurEnabled ? SWITCH_CLASSES.on : SWITCH_CLASSES.off
                      } ${toggleDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
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
                </div>
              </div>

    </>
  )
}



