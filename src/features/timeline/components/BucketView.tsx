'use client'

import { Circle } from 'lucide-react'
import type { TimeBucket } from '../utils'

export function BucketView({
  buckets,
  onSelectEvent,
  axisY,
  spanningOffset = 0,
}: {
  buckets: TimeBucket[]
  onSelectEvent: (id: number) => void
  axisY: number
  spanningOffset?: number
}) {
  const bucketTop = axisY + 24 + spanningOffset
  return (
    <>
      {buckets.map((bucket) => (
        <div
          key={bucket.startYear}
          className="absolute border border-line bg-paper-card px-2 py-1.5"
          style={{
            left: bucket.x,
            top: bucketTop,
            width: Math.max(bucket.width - 8, 120),
          }}
        >
          <div className="mb-1.5 text-xs text-ink-muted font-mono border-b border-line pb-1">
            {bucket.label}
          </div>
          {bucket.events.map((event) => (
            <button
              key={event.id}
              onClick={() => onSelectEvent(event.id)}
              className="flex h-6 w-full items-center gap-1 truncate px-1 text-xs text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink active:bg-[var(--oc-hover)]"
              title={event.summary || event.title}
            >
              {event.isMajor ? (
                <Circle
                  size={6}
                  fill="var(--color-error)"
                  className="shrink-0 text-error"
                />
              ) : null}
              <span className="truncate">{event.title}</span>
              {event.endTime ? (
                <span className="shrink-0 text-[10px] text-ink-faint ml-1">
                  {event.time}~{event.endTime}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ))}
    </>
  )
}



