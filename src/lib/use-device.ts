'use client'

import { useState, useEffect } from 'react'
import { isNativePlatform } from './env'

interface UseDeviceResult {
  isMobile: boolean
}

function isNarrowScreen(): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768
}

function isMobileAgent(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

export function useDevice(): UseDeviceResult {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = (): void => {
      setIsMobile(isNativePlatform() || isNarrowScreen() || isMobileAgent())
    }

    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return { isMobile }
}
