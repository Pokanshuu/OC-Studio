import type { ReactNode } from 'react'

export interface ContextMenuProps {
  children: ReactNode
  items: ContextMenuItem[]
}

export interface ContextMenuItem {
  label: string
  shortcut?: string
  danger?: boolean
  onClick?: () => void
  separator?: boolean
  disabled?: boolean
  children?: ContextMenuItem[]
}
