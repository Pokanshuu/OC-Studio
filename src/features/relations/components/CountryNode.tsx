'use client'

import type { NodeProps } from '@xyflow/react'
import { Avatar } from '@/components/shared/Avatar'
import { getImageUrl } from '@/lib/image-service'
import { RelationHandle } from './RelationHandle'

export function CountryNode({ data }: NodeProps) {
  const flagUrl = data.flagUrl as string | undefined

  return (
    <>
      <div className="flex flex-col items-center gap-1 group cursor-pointer">
        <Avatar
          src={getImageUrl(flagUrl, 'flag')}
          className="h-14 w-14 rounded-md border-2 border-paper"
          size="md"
        />
        <span className="text-xs text-ink text-center max-w-[80px] truncate">
          {data.label as string}
        </span>
      </div>
      <RelationHandle centerY={60} size={20} />
    </>
  )
}
