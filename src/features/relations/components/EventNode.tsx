'use client'

import type { NodeProps } from '@xyflow/react'
import { CalendarDays } from 'lucide-react'
import { getImageUrl } from '@/lib/image-service'
import { RelationHandle } from './RelationHandle'

export function EventNode({ data }: NodeProps) {
  const imageUrl = data.imageUrl as string | undefined

  return (
    <>
      <div className="group flex cursor-pointer flex-col items-center gap-1">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={getImageUrl(imageUrl, 'header')}
            alt=""
            className="h-12 w-12 rounded-full border-2 border-line bg-paper-card object-cover shadow-sm transition-colors group-hover:border-ink-muted"
          />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-line-hover bg-paper-card text-ink-muted shadow-sm transition-colors group-hover:border-ink-muted group-hover:text-ink">
            <CalendarDays size={14} strokeWidth={2} />
          </span>
        )}
        <span className="max-w-[96px] truncate text-[10px] text-ink">{data.label as string}</span>
        {data.subtitle ? (
          <span className="text-[9px] text-ink-faint">{data.subtitle as string}</span>
        ) : null}
      </div>
      <RelationHandle centerY={52} size={20} />
    </>
  )
}
