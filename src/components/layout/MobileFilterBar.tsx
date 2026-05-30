'use client'

import type { ReactNode } from 'react'

interface MobileFilterBarProps {
  children?: ReactNode
}

export function MobileFilterBar({ children }: MobileFilterBarProps) {
  return (
    <div className="md:hidden fixed top-[calc(60px+var(--safe-top))] left-0 right-0 z-30 flex h-10 items-center justify-between border-b border-line/50 bg-paper-alt/85 px-4 backdrop-blur-lg">
      {children}
    </div>
  )
}
