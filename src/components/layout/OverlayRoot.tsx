'use client'

export function OverlayRoot() {
  return (
    <div
      id="overlay-root"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        // Zero-sized mount point: it must not block the app, but portaled
        // dialogs and menus still need pointer events and must not be clipped.
        width: 0,
        height: 0,
        overflow: 'visible',
        zIndex: 999999,
      }}
    />
  )
}
