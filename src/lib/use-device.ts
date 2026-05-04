'use client'

import { useState, useEffect } from 'react'

interface UseDeviceResult {
  isMobile: boolean
}

export function useDevice(): UseDeviceResult {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = (): void => {
      setIsMobile(window.innerWidth < 768)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return { isMobile }
}
