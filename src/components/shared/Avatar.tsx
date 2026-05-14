'use client'

import { useState } from 'react'
import { resolveImageUrl, getDefaultImage } from '@/lib/image-service'

export interface AvatarProps {
  src?: string
  alt?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
  type?: 'avatar' | 'flag'
  shape?: 'circle' | 'square'
}

const SIZE_MAP: Record<string, string> = {
  sm: 'w-6 h-6',
  md: 'w-10 h-10',
  lg: 'w-16 h-16',
}

export function Avatar({ src, alt = '', size = 'md', className = '', type = 'avatar', shape = 'circle' }: AvatarProps) {
  const [failedImgSrc, setFailedImgSrc] = useState<string | undefined>()
  const imgSrc = resolveImageUrl(src, type)
  const showImage = imgSrc && imgSrc !== failedImgSrc
  const rounded = shape === 'square' ? 'rounded-md' : 'rounded-full'

  return (
    <div
      className={`shrink-0 overflow-hidden border border-line ${rounded} ${SIZE_MAP[size]} ${className}`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgSrc}
          alt={alt}
          onError={() => setFailedImgSrc(imgSrc)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className={`flex h-full w-full items-center justify-center bg-paper-card ${rounded}`}>
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
