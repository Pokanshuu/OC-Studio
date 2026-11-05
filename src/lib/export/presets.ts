/**
 * 导出预设（库内 `.ocstudio/exports.json`）。
 *
 * 浏览器 / Mock 退化为 localStorage（键 `oc-export-presets`），只为让界面点得动；
 * 真机 Tauri 里读写的是库文件，跟 templates / categories / fields 同一套「库优先」规则。
 */
import { getVaultSession } from '@/lib/vault/vault-session'
import { isVaultSupported, vaultFs } from '@/lib/vault/vault-fs'
import type { SiteSectionOptions } from './site/build'

export const EXPORT_PRESETS_FILE = '.ocstudio/exports.json'

export type ImagePadding = 'compact' | 'standard' | 'loose'
export type ImageBackground = 'paper' | 'transparent'
export type ImageRatio = 'card' | 'square' | 'portrait'

export interface ImageExportOptions {
  ratio: ImageRatio
  background: ImageBackground
  padding: ImagePadding
  showCover: boolean
  showFields: boolean
  showTags: boolean
  showSummary: boolean
  showBody: boolean
  showSignature: boolean
}

export const DEFAULT_IMAGE_EXPORT_OPTIONS: ImageExportOptions = {
  ratio: 'card',
  background: 'paper',
  padding: 'standard',
  showCover: true,
  showFields: true,
  showTags: true,
  showSummary: true,
  showBody: true,
  showSignature: true,
}

export interface ImageExportPreset {
  id: string
  name: string
  options: ImageExportOptions
  /** 内置预设：可应用、可设默认，但不可删 */
  builtin?: boolean
}

/** 三个内置版式：角色卡 3:4 · 方卡 1:1 · 竖版 9:16 */
export const BUILTIN_IMAGE_PRESETS: ImageExportPreset[] = [
  {
    id: 'builtin-card',
    name: '角色卡',
    builtin: true,
    options: { ...DEFAULT_IMAGE_EXPORT_OPTIONS, ratio: 'card' },
  },
  {
    id: 'builtin-square',
    name: '方卡',
    builtin: true,
    options: { ...DEFAULT_IMAGE_EXPORT_OPTIONS, ratio: 'square' },
  },
  {
    id: 'builtin-portrait',
    name: '竖版',
    builtin: true,
    options: { ...DEFAULT_IMAGE_EXPORT_OPTIONS, ratio: 'portrait', padding: 'loose' },
  },
]

export type SiteThemeChoice = 'current' | 'paper' | 'auto'

export interface SiteExportPresetConfig {
  title: string
  sections: SiteSectionOptions
  theme: SiteThemeChoice
  inlineImages: boolean
}

export interface SiteExportPreset {
  id: string
  name: string
  config: SiteExportPresetConfig
}

export interface ExportPresetsFile {
  version: 1
  image: ImageExportPreset[]
  site: SiteExportPreset[]
}

const DEFAULT_SECTIONS: SiteSectionOptions = {
  timeline: true,
  characters: true,
  events: true,
  countries: true,
  world: true,
  relations: true,
}

const EMPTY_PRESETS: ExportPresetsFile = { version: 1, image: [], site: [] }
const LOCAL_KEY = 'oc-export-presets'

function normalizeOptions(value: unknown): ImageExportOptions {
  if (value === null || typeof value !== 'object') return DEFAULT_IMAGE_EXPORT_OPTIONS
  const record = value as Partial<ImageExportOptions>
  return {
    ratio: record.ratio === 'square' || record.ratio === 'portrait' ? record.ratio : 'card',
    background: record.background === 'transparent' ? 'transparent' : 'paper',
    padding:
      record.padding === 'compact' || record.padding === 'loose' ? record.padding : 'standard',
    showCover: record.showCover !== false,
    showFields: record.showFields !== false,
    showTags: record.showTags !== false,
    showSummary: record.showSummary !== false,
    showBody: record.showBody !== false,
    showSignature: record.showSignature !== false,
  }
}

function normalizeSite(value: unknown): SiteExportPresetConfig {
  if (value === null || typeof value !== 'object') {
    return { title: '', sections: DEFAULT_SECTIONS, theme: 'current', inlineImages: true }
  }
  const record = value as Partial<SiteExportPresetConfig>
  const sections = record.sections ?? DEFAULT_SECTIONS
  return {
    title: typeof record.title === 'string' ? record.title : '',
    sections: {
      timeline: sections.timeline !== false,
      characters: sections.characters !== false,
      events: sections.events !== false,
      countries: sections.countries !== false,
      world: sections.world !== false,
      relations: sections.relations !== false,
    },
    theme: record.theme === 'paper' || record.theme === 'auto' ? record.theme : 'current',
    inlineImages: record.inlineImages !== false,
  }
}

function normalizePresets(value: unknown): ExportPresetsFile {
  if (value === null || typeof value !== 'object') return EMPTY_PRESETS
  const record = value as { image?: unknown; site?: unknown }
  const image = Array.isArray(record.image)
    ? record.image
        .map((item) => {
          if (item === null || typeof item !== 'object') return null
          const row = item as { id?: unknown; name?: unknown; options?: unknown }
          if (typeof row.name !== 'string' || row.name.trim() === '') return null
          return {
            id: typeof row.id === 'string' && row.id !== '' ? row.id : row.name,
            name: row.name.trim(),
            options: normalizeOptions(row.options),
          }
        })
        .filter((item): item is ImageExportPreset => item !== null)
    : []
  const site = Array.isArray(record.site)
    ? record.site
        .map((item) => {
          if (item === null || typeof item !== 'object') return null
          const row = item as { id?: unknown; name?: unknown; config?: unknown }
          if (typeof row.name !== 'string' || row.name.trim() === '') return null
          return {
            id: typeof row.id === 'string' && row.id !== '' ? row.id : row.name,
            name: row.name.trim(),
            config: normalizeSite(row.config),
          }
        })
        .filter((item): item is SiteExportPreset => item !== null)
    : []
  return { version: 1, image, site }
}

async function readFile(): Promise<ExportPresetsFile> {
  const root = getVaultSession()?.root
  if (root && isVaultSupported()) {
    try {
      if (await vaultFs.exists(root, EXPORT_PRESETS_FILE)) {
        const bytes = await vaultFs.readBytes(root, EXPORT_PRESETS_FILE)
        const text = new TextDecoder().decode(new Uint8Array(bytes))
        return normalizePresets(JSON.parse(text) as unknown)
      }
    } catch {
      // 坏文件 / 读不到：回落到空表，不阻塞导出
    }
  }

  if (typeof window === 'undefined') return EMPTY_PRESETS
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY)
    if (!raw) return EMPTY_PRESETS
    return normalizePresets(JSON.parse(raw) as unknown)
  } catch {
    return EMPTY_PRESETS
  }
}

async function writeFile(file: ExportPresetsFile): Promise<void> {
  const text = JSON.stringify(file, null, 2)
  const root = getVaultSession()?.root
  if (root && isVaultSupported()) {
    const [result] = await vaultFs.writeTexts(root, [{ relPath: EXPORT_PRESETS_FILE, content: text }])
    if (!result?.ok) throw new Error('导出预设写入失败')
    return
  }
  if (typeof window !== 'undefined') window.localStorage.setItem(LOCAL_KEY, text)
}

export async function loadExportPresets(): Promise<ExportPresetsFile> {
  return readFile()
}

export async function saveImagePreset(name: string, options: ImageExportOptions): Promise<ExportPresetsFile> {
  const trimmed = name.trim()
  if (trimmed === '') throw new Error('预设名不能为空')
  const current = await readFile()
  const id = crypto.randomUUID?.() ?? `${Date.now()}`
  const existing = current.image.find((preset) => preset.name === trimmed)
  const image = existing
    ? current.image.map((preset) => (preset.id === existing.id ? { ...preset, options } : preset))
    : [...current.image, { id, name: trimmed, options }]
  const next: ExportPresetsFile = { version: 1, image, site: current.site }
  await writeFile(next)
  return next
}

export async function deleteImagePreset(id: string): Promise<ExportPresetsFile> {
  const current = await readFile()
  const next: ExportPresetsFile = {
    version: 1,
    image: current.image.filter((preset) => preset.id !== id),
    site: current.site,
  }
  await writeFile(next)
  return next
}

export async function saveSitePreset(name: string, config: SiteExportPresetConfig): Promise<ExportPresetsFile> {
  const trimmed = name.trim()
  if (trimmed === '') throw new Error('预设名不能为空')
  const current = await readFile()
  const id = crypto.randomUUID?.() ?? `${Date.now()}`
  const existing = current.site.find((preset) => preset.name === trimmed)
  const site = existing
    ? current.site.map((preset) => (preset.id === existing.id ? { ...preset, config } : preset))
    : [...current.site, { id, name: trimmed, config }]
  const next: ExportPresetsFile = { version: 1, image: current.image, site }
  await writeFile(next)
  return next
}

export async function deleteSitePreset(id: string): Promise<ExportPresetsFile> {
  const current = await readFile()
  const next: ExportPresetsFile = {
    version: 1,
    image: current.image,
    site: current.site.filter((preset) => preset.id !== id),
  }
  await writeFile(next)
  return next
}
