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
import { ThemeRadio, ThemePresetRadio, LayoutRadio, CoverTintRadio, MouseModeRadio, EdgeStyleRadio, SWITCH_CLASSES, SWITCH_DOT } from '../controls'
import { THEME_PRESETS } from '@/lib/theme/presets'
export function GeneralTab() {
  const { settings, updateSetting } = useSettings()
  const { isMobile } = useDevice()
  const [blurEnabled, setBlurEnabled] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("blur-effect-enabled") === "true"
  })

  const [blurSupported, setBlurSupported] = useState(false)
  const [backgroundBusy, setBackgroundBusy] = useState(false)
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

  /** 背景图与 Mica 互斥：设图时把窗口模糊关掉，并把 localStorage 一起改，重开也不会再启用 */
  const disableBlur = () => {
    setBlurEnabled(false)
    try { localStorage.setItem("blur-effect-enabled", "false") } catch {}
    document.documentElement.classList.remove("tauri-mica")
    if (!isTauri) return
    try {
      invoke<boolean>("update_blur_effect", {
        enabled: false,
        isDark: document.documentElement.classList.contains("dark"),
      }).catch(() => {})
    } catch {}
  }

  const handleBackgroundFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBackgroundBusy(true)
    try {
      const compressed = await compressBackgroundImage(file)
      const session = getVaultSession()
      const previous = settings.backgroundImage
      let next = compressed.dataUrl
      if (session !== null && isVaultSupported()) {
        const relPath = `.ocstudio/backgrounds/background-${Date.now()}.webp`
        await vaultFs.writeBytes(session.root, relPath, Array.from(compressed.bytes))
        next = relPath
      }
      updateSetting("backgroundImage", next)
      disableBlur()
      // 旧背景是我们自己写的文件才删；换库 / 旧 data URL 一律不碰
      if (session !== null && previous.startsWith('.ocstudio/backgrounds/') && previous !== next) {
        try {
          await vaultFs.remove(session.root, previous)
        } catch {
          // 删不掉最多留一个孤儿文件，不影响新背景
        }
      }
    } catch (error) {
      toast.error('背景图读取失败', { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setBackgroundBusy(false)
    }
  }

  const handleRemoveBackground = async () => {
    const previous = settings.backgroundImage
    updateSetting("backgroundImage", "")
    const session = getVaultSession()
    if (session !== null && previous.startsWith('.ocstudio/backgrounds/')) {
      try {
        await vaultFs.remove(session.root, previous)
      } catch {
        // 文件可能已被外部删掉；界面已经清空，不阻塞
      }
    }
  }

  const backgroundModes: Array<{ value: BackgroundMode; label: string }> = [
    { value: 'cover', label: '填充' },
    { value: 'tile', label: '平铺' },
    { value: 'fixed', label: '固定' },
  ]
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
                  <span className="text-sm text-ink">主题</span>
                  <ThemeRadio
                    value={settings.theme}
                    onChange={(v) =>
                      updateSetting("theme", v as "light" | "dark" | "auto")
                    }
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm text-ink">纸色</span>
                  <ThemePresetRadio
                    value={settings.themePreset}
                    onChange={(v) => updateSetting("themePreset", v)}
                    presets={THEME_PRESETS}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm text-ink">背景</span>
                  <input
                    ref={backgroundInputRef}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => void handleBackgroundFile(event)}
                  />
                  {settings.backgroundImage !== '' ? (
                    <>
                      <div className="flex items-center gap-3">
                        <div
                          className="h-14 w-24 shrink-0 rounded-item border border-line bg-cover bg-center"
                          style={{ backgroundImage: `url("${settings.backgroundImage}")` }}
                          aria-hidden
                        />
                        <div className="flex flex-col items-start gap-1">
                          <button
                            type="button"
                            onClick={() => backgroundInputRef.current?.click()}
                            disabled={backgroundBusy}
                            className={BTN_QUIET}
                          >
                            {backgroundBusy ? '处理中…' : '更换图片'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRemoveBackground()}
                            className={`${BTN_QUIET} hover:text-error`}
                          >
                            <Trash2 size={13} strokeWidth={2} />
                            移除
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {backgroundModes.map((mode) => (
                          <button
                            key={mode.value}
                            type="button"
                            aria-pressed={settings.backgroundMode === mode.value}
                            onClick={() => updateSetting("backgroundMode", mode.value)}
                            className={`rounded-item px-2 py-1 text-[12px] transition-colors ${
                              settings.backgroundMode === mode.value
                                ? 'bg-[var(--oc-hover)] text-ink'
                                : 'text-ink-muted hover:text-ink'
                            }`}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>
                      <label className="flex items-center gap-2">
                        <span className="w-8 shrink-0 text-[11px] text-ink-faint">遮罩</span>
                        <input
                          type="range"
                          min={BACKGROUND_MIN_SCRIM * 100}
                          max={BACKGROUND_MAX_SCRIM * 100}
                          step={5}
                          value={Math.round(settings.backgroundScrim * 100)}
                          onChange={(event) =>
                            updateSetting("backgroundScrim", Number(event.target.value) / 100)
                          }
                          className="h-4 min-w-0 flex-1"
                          style={{ accentColor: 'var(--oc-ink-muted)' }}
                        />
                        <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-ink-faint">
                          {Math.round(settings.backgroundScrim * 100)}%
                        </span>
                      </label>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => backgroundInputRef.current?.click()}
                      disabled={backgroundBusy}
                      className={`${BTN_QUIET} justify-start`}
                    >
                      <ImagePlus size={14} strokeWidth={2} />
                      {backgroundBusy ? '处理中…' : '选择背景图...'}
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm text-ink">编辑界面样式</span>
                  <LayoutRadio
                    value={settings.editorLayout}
                    onChange={(v) => updateSetting("editorLayout", v)}
                  />
                  <span className="text-[11px] text-ink-faint">切换时自动保存正文</span>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm text-ink">封面卡配色</span>
                  <CoverTintRadio
                    value={settings.coverTintMode}
                    onChange={(v) => updateSetting("coverTintMode", v)}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm text-ink">关系图鼠标</span>
                  <MouseModeRadio
                    value={settings.mouseMode}
                    onChange={(v) => updateSetting("mouseMode", v)}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm text-ink">关系图连线</span>
                  <EdgeStyleRadio
                    value={settings.edgeStyle}
                    onChange={(v) => updateSetting("edgeStyle", v)}
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
                    <span className="text-[11px] text-ink-faint">有背景图时不可用</span>
                  ) : null}
                </div>
              </div>

    </>
  )
}



