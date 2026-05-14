'use client'

export function OverlayRoot() {
  return <div id="overlay-root" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 999999 }} />
}
