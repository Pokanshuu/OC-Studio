export interface CountryFormData {
  name: string
  parentId: number | null
  description: string
  document?: unknown
  system: string
  geography: string
  culture: string
  characters?: number[]
  events?: number[]
}
