import type { ViewMode, SortOption } from '@/components/shared/SortViewControls'
import type { Country } from '@/types'
import { stripHtml } from '@/lib/utils'
import { extractCountryPreview } from '@/lib/document-utils'

export type CountrySortKey = 'name' | 'updatedAt' | 'createdAt'

export const COUNTRY_SORT_OPTIONS: SortOption[] = [
  { label: '按名称', value: 'name' },
  { label: '按编辑时间', value: 'updatedAt' },
  { label: '按创建时间', value: 'createdAt' },
]

/** 视图偏好（网格 / 目录）落 localStorage */
export function readViewPreference(): ViewMode {
  if (typeof window === 'undefined') return 'grid'
  return (localStorage.getItem('oc-countries-view') as ViewMode) ?? 'grid'
}

export function writeViewPreference(mode: ViewMode): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('oc-countries-view', mode)
  }
}

export function sortCountryList(countries: Country[], key: CountrySortKey): Country[] {
  return [...countries].sort((a, b) => {
    if (key === 'name') return a.name.localeCompare(b.name, 'zh-Hans')
    if (key === 'updatedAt') return b.updatedAt - a.updatedAt
    return b.createdAt - a.createdAt
  })
}

/** 卡片/行共用的简介：优先取正文预览，否则退回政体文本 */
export function countryPreview(country: Country): string {
  return extractCountryPreview(country.document) ?? stripHtml(country.system ?? '')
}
