'use client'

import { useState } from 'react'
import { resolveImageUrl, getDefaultImage } from '@/lib/image-service'

export interface AvatarProps {
  src?: string
  alt?: string
  /** 预设档位；也可以直接给像素边长 */
  size?: 'sm' | 'md' | 'lg' | number
  /** 填满父级（封面卡的头像槽位随卡片缩放，用这个） */
  fill?: boolean
  className?: string
  type?: 'avatar' | 'flag'
  shape?: 'circle' | 'square'
}

const SIZE_MAP: Record<string, string> = {
  sm: 'w-6 h-6',
  md: 'w-10 h-10',
  lg: 'w-16 h-16',
}

export function Avatar({ src, alt = '', size = 'md', fill = false, className = '', type = 'avatar', shape = 'circle' }: AvatarProps) {
  const [failedImgSrc, setFailedImgSrc] = useState<string | undefined>()
  const imgSrc = resolveImageUrl(src, type)
  const showImage = imgSrc && imgSrc !== failedImgSrc
  const roundClass = shape === 'square' ? 'rounded-item' : 'rounded-full'
  const sizeClass = fill ? 'h-full w-full' : typeof size === 'number' ? '' : SIZE_MAP[size]
  const sizeStyle = fill ? undefined : typeof size === 'number' ? { width: size, height: size } : undefined

  return (
    <div
      className={`shrink-0 overflow-hidden border border-line ${roundClass} ${sizeClass} ${className}`}
      style={sizeStyle}
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
        <div className={`flex h-full w-full items-center justify-center bg-paper-card ${roundClass}`}>
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
