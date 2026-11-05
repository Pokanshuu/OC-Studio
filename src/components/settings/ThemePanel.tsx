'use client'

/**
 * 「主题」二级页：外观相关的三件事收在一处 —— 纸色、背景图、封面卡配色。
 *
 * 三行都是「标签在上、控件在下」（`SETTINGS_FIELD`）：纸色一排 11 枚圆点、
 * 背景是缩略图 + 铺法 + 遮罩，都需要整行宽度；挤进标签右侧那一列会折行。
 *
 * 背景图与窗口材质（Mica）的关系：设图期间只撤运行时材质，**不动用户偏好**
 * （`blur-effect-enabled`），去掉背景后按偏好恢复。
 */
import { useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { ImagePlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useSettings } from '@/lib/settings'
import { isTauri as isTauriEnv } from '@/lib/env'
import { compressBackgroundImage, BACKGROUND_MAX_SCRIM, BACKGROUND_MIN_SCRIM } from '@/lib/theme/background'
import { THEME_PRESETS } from '@/lib/theme/presets'
import { getVaultSession } from '@/lib/vault/vault-session'
import { isVaultSupported, vaultFs } from '@/lib/vault/vault-fs'
import { BTN_QUIET, SETTINGS_FIELD, SETTINGS_GROUP, SETTINGS_LABEL } from '@/lib/ui-tokens'
import { CoverTintRadio, ThemePresetRadio } from './controls'

const BACKGROUND_MODES = [
  { value: 'cover', label: '填充' },
  { value: 'tile', label: '平铺' },
  { value: 'fixed', label: '固定' },
] as const

export function ThemePanel() {
  const { settings, updateSetting } = useSettings()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const isTauri = isTauriEnv()

  /** 设图期间把窗口材质暂时撤掉；不改偏好 */
  const suspendBlur = () => {
    document.documentElement.classList.remove('tauri-mica')
    if (!isTauri) return
    try {
      invoke<boolean>('update_blur_effect', {
        enabled: false,
        isDark: document.documentElement.classList.contains('dark'),
      }).catch(() => {})
    } catch {}
  }

  /** 去掉背景后按偏好把材质还回来 */
  const restoreBlur = () => {
    const wanted = localStorage.getItem('blur-effect-enabled') === 'true'
    if (!wanted || !isTauri) {
      document.documentElement.classList.remove('tauri-mica')
      return
    }
    try {
      invoke<boolean>('update_blur_effect', {
        enabled: true,
        isDark: document.documentElement.classList.contains('dark'),
      }).then((applied) => {
        document.documentElement.classList.toggle('tauri-mica', applied)
      }).catch(() => {})
    } catch {}
  }

  const pickBackground = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const compressed = await compressBackgroundImage(file)
      const session = getVaultSession()
      let next = compressed.dataUrl
      if (session !== null && isVaultSupported()) {
        const relPath = `.ocstudio/backgrounds/background-${Date.now()}.webp`
        await vaultFs.writeBytes(session.root, relPath, Array.from(compressed.bytes))
        next = relPath
        // 写完扫一遍：不是这一张的 background-* 全删，避免删失败 / 换库攒孤儿
        try {
          const keep = relPath.split('/').pop()
          const assets = await vaultFs.listAssets(session.root, 'backgrounds')
          await Promise.all(
            assets
              .filter((asset) => asset.name !== keep && /^background-.*\.(webp|png|jpe?g)$/i.test(asset.name))
              .map((asset) => vaultFs.remove(session.root, asset.relPath).catch(() => undefined)),
          )
        } catch {
          // 扫不动目录不影响换图，下次再扫
        }
      }
      updateSetting('backgroundImage', next)
      suspendBlur()
    } catch (error) {
      toast.error('背景图读取失败', { description: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  const removeBackground = async () => {
    const previous = settings.backgroundImage
    updateSetting('backgroundImage', '')
    const session = getVaultSession()
    if (session !== null && previous.startsWith('.ocstudio/backgrounds/')) {
      try {
        await vaultFs.remove(session.root, previous)
      } catch {
        // 文件可能已被外部删掉；界面已清空，不阻塞
      }
    }
    restoreBlur()
  }

  const hasImage = settings.backgroundImage !== ''

  return (
    <div className="flex flex-col">
      <div className={SETTINGS_FIELD}>
        <span className={SETTINGS_LABEL}>纸色</span>
        <ThemePresetRadio
          value={settings.themePreset}
          onChange={(v) => updateSetting('themePreset', v)}
          presets={THEME_PRESETS}
        />
      </div>

      <div className={SETTINGS_GROUP}>
        <div className={SETTINGS_FIELD}>
          <span className={SETTINGS_LABEL}>背景</span>
          <div className="flex min-w-0 flex-col gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => void pickBackground(e)} />
            {hasImage ? (
              <>
                <div className="flex items-center gap-3">
                  <div
                    className="h-14 w-24 shrink-0 rounded-item border border-line bg-cover bg-center"
                    style={{ backgroundImage: `url("${settings.backgroundImage}")` }}
                    aria-hidden
                  />
                  <div className="flex flex-col items-start gap-1">
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={BTN_QUIET}>
                      {busy ? '处理中…' : '更换图片'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeBackground()}
                      className={`${BTN_QUIET} hover:text-error`}
                    >
                      <Trash2 size={13} strokeWidth={2} />
                      移除
                    </button>
                  </div>
                </div>
                <div className="flex gap-1">
                  {BACKGROUND_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      aria-pressed={settings.backgroundMode === mode.value}
                      onClick={() => updateSetting('backgroundMode', mode.value)}
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
                    onChange={(e) => updateSetting('backgroundScrim', Number(e.target.value) / 100)}
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
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className={`${BTN_QUIET} justify-start`}
              >
                <ImagePlus size={14} strokeWidth={2} />
                {busy ? '处理中…' : '选择背景图…'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={SETTINGS_GROUP}>
        <div className={SETTINGS_FIELD}>
          <span className={SETTINGS_LABEL}>封面卡</span>
          <CoverTintRadio
            value={settings.coverTintMode}
            onChange={(v) => updateSetting('coverTintMode', v)}
          />
        </div>
      </div>
    </div>
  )
}
