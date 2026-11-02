export interface CountryFormData {
  name: string
  accentColor?: string
  parentId: number | null
  description: string
  document?: unknown
  system: string
  geography: string
  culture: string
  flagUrl?: string
  headerUrl?: string
  characters?: number[]
  events?: number[]
  relatedNations?: number[]
  relatedNationLabels?: Record<number, string>
  relatedEventLabels?: Record<number, string>
  tags: number[]
}
