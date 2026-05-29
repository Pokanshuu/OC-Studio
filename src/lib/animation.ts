'use client'

const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)

/**
 * Wraps a callback with a micro-delay on touch devices so the browser
 * can paint the :active / touch-feedback state before navigation.
 * On non-touch devices the callback fires immediately.
 */
export function withTouchFeedback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs = 80
): (...args: Args) => void {
  return (...args: Args) => {
    if (!isTouchDevice()) {
      fn(...args)
      return
    }
    requestAnimationFrame(() => {
      setTimeout(() => fn(...args), delayMs)
    })
  }
}
