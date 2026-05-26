'use client'

export function OverlayRoot() {
  return <div id="overlay-root" style={{ position: 'fixed', top: 0, left: 0, pointerEvents: 'none', zIndex: 999999, width: 0, height: 0, overflow: 'hidden' }} />
}
