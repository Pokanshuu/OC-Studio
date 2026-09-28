import type { ViewMode, SortOption } from '@/components/shared/SortViewControls'
import type { Character } from '@/types'

export type SortKey = 'name' | 'updatedAt' | 'createdAt'

export const SORT_OPTIONS: SortOption[] = [
  { label: '按名称', value: 'name' },
  { label: '按编辑时间', value: 'updatedAt' },
  { label: '按创建时间', value: 'createdAt' },
]

/** 视图偏好（网格 / 目录）落 localStorage */
export function readViewPreference(): ViewMode {
  if (typeof window === 'undefined') return 'grid'
  return (localStorage.getItem('oc-characters-view') as ViewMode) ?? 'grid'
}

export function writeViewPreference(mode: ViewMode): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('oc-characters-view', mode)
  }
}

export function sortCharacters(characters: Character[], key: SortKey): Character[] {
  return [...characters].sort((a, b) => {
    if (key === 'name') {
      return a.name.localeCompare(b.name, 'zh-Hans')
    }
    if (key === 'updatedAt') {
      return b.updatedAt - a.updatedAt
    }
    return b.createdAt - a.createdAt
  })
}

export function aliasesText(aliases: string[]): string {
  if (!Array.isArray(aliases)) return (aliases as unknown as string) || ''
  return aliases.join('、')
}

export function aliasesMatch(aliases: string[], q: string): boolean {
  if (!Array.isArray(aliases)) return ((aliases as unknown as string) || '').toLowerCase().includes(q)
  return aliases.some((a) => a.toLowerCase().includes(q))
}
