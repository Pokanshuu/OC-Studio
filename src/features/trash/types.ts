export type TrashItemType = 'character' | 'event' | 'country' | 'worldEntry'

export interface TrashItem {
  id: number
  name: string
  type: TrashItemType
  typeLabel: string
  deletedAt: number
}
