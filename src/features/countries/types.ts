export interface CountryFormData {
  name: string
  parentId: number | null
  description: string
  system: string
  geography: string
  culture: string
  characters?: number[]
  events?: number[]
}
