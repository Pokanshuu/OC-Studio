export interface CountryFormData {
  name: string
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
}
