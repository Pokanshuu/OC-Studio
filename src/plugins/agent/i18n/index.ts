/**
 * Localisation hook.
 *
 * `language: 'auto'` follows the OS/browser locale. The chosen language drives
 * both UI copy and typography (Chinese gets justified text, Latin is left
 * aligned) — see `styles/base.css`.
 */

import { useMemo } from 'react'
import { DICTS, type TextKey } from './dict'
import { useSettingsStore } from '@/plugins/agent/state/settings'

export type Lang = 'zh' | 'en'
/**
 * Accepts a literal key for typo-safety at the call site, but `string` is
 * allowed too: a few lookups are table-driven (`STATUS_KEY[call.status]`), and
 * forcing casts there adds noise without adding safety.
 */
export type TFn = (key: TextKey | string, vars?: Record<string, string | number>) => string

export function resolveLang(preference: 'auto' | 'zh' | 'en'): Lang {
  if (preference === 'zh' || preference === 'en') return preference
  const locale =
    typeof navigator !== 'undefined' ? navigator.language || navigator.languages?.[0] : 'zh'
  return (locale ?? 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_whole, key: string) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  )
}

export function tFor(lang: Lang): TFn {
  const dict = DICTS[lang] as Record<string, string>
  const fallback = DICTS.zh as Record<string, string>
  return (key, vars) => interpolate(dict[key] ?? fallback[key] ?? String(key), vars)
}

export function useLang(): Lang {
  const preference = useSettingsStore((s) => s.settings.ui.language)
  return resolveLang(preference)
}

export function useT(): TFn {
  const lang = useLang()
  return useMemo(() => tFor(lang), [lang])
}

/** Non-reactive translation for stores and event handlers. */
export function tGlobal(key: TextKey | string, vars?: Record<string, string | number>): string {
  const preference = useSettingsStore.getState().settings.ui.language
  return tFor(resolveLang(preference))(key, vars)
}
