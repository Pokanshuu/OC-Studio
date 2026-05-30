'use client'

import { useState, useEffect } from 'react'

interface UseDeviceResult {
  isMobile: boolean
}

function isCapacitor(): boolean {
  if (typeof window === 'undefined') return false
  const c = (window as any).Capacitor
  // isNativePlatform() returns true only in a real native Capacitor app,
  // not when @capacitor/core is loaded as a web library in the browser.
  if (c != null && c.isNativePlatform?.() === true) return true
  const ua = navigator.userAgent
  return ua.includes('Android') || ua.includes('iPhone') || ua.includes('iPad')
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
      setIsMobile(isCapacitor() || isNarrowScreen() || isMobileAgent())
    }

    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return { isMobile }
}
