'use client'

import { useState } from 'react'
import { resolveImageUrl, getDefaultImage } from '@/lib/image-service'

export interface AvatarProps {
  src?: string
  alt?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
  type?: 'avatar' | 'flag'
}

const SIZE_MAP: Record<string, string> = {
  sm: 'w-6 h-6',
  md: 'w-10 h-10',
  lg: 'w-16 h-16',
}

export function Avatar({ src, alt = '', size = 'md', className = '', type = 'avatar' }: AvatarProps) {
  const [error, setError] = useState(false)
  const imgSrc = error ? undefined : resolveImageUrl(src, type)

  return (
    <div
      className={`shrink-0 overflow-hidden rounded-full border border-line ${SIZE_MAP[size]} ${className}`}
    >
      {imgSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgSrc}
          alt={alt}
          onError={() => setError(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-paper-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getDefaultImage(type)}
            alt=""
            className="h-full w-full object-contain p-1"
          />
        </div>
      )}
    </div>
  )
}
