'use client'

import { ImageIcon } from 'lucide-react'
import { resolveImageUrl } from '@/lib/image-service'
import { Avatar } from './Avatar'

interface ProfileBannerProps {
  headerUrl?: string
  avatarUrl?: string
}

export function ProfileBanner({ headerUrl, avatarUrl }: ProfileBannerProps) {
  const headerSrc = headerUrl ? resolveImageUrl(headerUrl) : undefined

  return (
    <div className="relative w-full">
      {/* Header — CSS intrinsic ratio */}
      <div
        className="relative w-full overflow-hidden rounded-lg bg-paper-card aspect-[3/1]"
      >
        {headerSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={headerSrc}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon size={32} strokeWidth={1.5} className="text-ink-faint opacity-40" />
          </div>
        )}
      </div>

      {/* Avatar overlapping header bottom */}
      <div className="absolute -bottom-6 left-4">
        <div className="overflow-hidden rounded-full border-[4px] border-paper dark:border-[#1C1B1A]">
          <Avatar src={avatarUrl} size="lg" />
        </div>
      </div>
    </div>
  )
}
