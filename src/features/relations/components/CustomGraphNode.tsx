'use client'

import type { NodeProps } from '@xyflow/react'
import { FolderOpen, Shapes } from 'lucide-react'
import { accentGradient, resolveAccentColor } from '@/lib/entity-accent'
import { resolveImageUrl } from '@/lib/image-service'
import { RelationHandle } from './RelationHandle'

export function CustomGraphNode({ data }: NodeProps) {
  const isSection = data.customKind === 'section'
  const connectable = !isSection
  const onOpen = data.onOpen as (() => void) | undefined
  const accent = isSection
    ? resolveAccentColor(data.accentColor as string | undefined, String(data.label ?? ''))
    : null
  return (
    <>
      <div
      onClick={onOpen}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      className={`relative z-10 flex w-[160px] max-w-[160px] flex-col items-center gap-0.5 overflow-visible rounded-xl border bg-paper-card px-2.5 py-2 ${
        isSection ? 'border-ink/30' : 'border-line'
      } ${onOpen ? 'cursor-pointer hover:border-ink/50' : ''}`}
      style={
        accent
          ? { backgroundImage: accentGradient(accent), borderColor: `${accent}55` }
          : undefined
      }
    >
      <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-line text-ink-muted">
        {!isSection && data.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveImageUrl(data.avatarUrl as string)}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : isSection ? (
          <FolderOpen size={12} strokeWidth={2} />
        ) : (
          <Shapes size={12} strokeWidth={2} />
        )}
      </span>
      <span className="w-full truncate text-center text-xs text-ink">{data.label as string}</span>
      {data.subtitle ? (
        <span className="w-full truncate text-center text-[9px] text-ink-faint">
          {data.subtitle as string}
        </span>
      ) : null}
      </div>
      {connectable ? (
        <RelationHandle centerY={46} size={18} />
      ) : null}
    </>
  )
}


