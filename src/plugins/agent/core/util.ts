/** Id generation with a fallback for contexts without `crypto.randomUUID`. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // RFC 4122 v4 shape; collision risk is irrelevant at this scale.
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Debounce that also exposes an immediate flush (used for draft persistence). */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number,
): ((...args: A) => void) & { flush: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastArgs: A | null = null

  const wrapped = (...args: A) => {
    lastArgs = args
    if (timer !== null) return
    timer = setTimeout(() => {
      timer = null
      const pending = lastArgs
      lastArgs = null
      if (pending) fn(...pending)
    }, waitMs)
  }

  wrapped.flush = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    const pending = lastArgs
    lastArgs = null
    if (pending) fn(...pending)
  }

  wrapped.cancel = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    lastArgs = null
  }

  return wrapped
}

/**
 * Leading-edge throttled emitter: the first value is delivered immediately, then
 * at most one per window. Streaming needs this exact shape — a trailing-only
 * debounce would show nothing until the stream ends (the classic "text appears
 * all at once" bug).
 */
export function throttle<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number,
): ((...args: A) => void) & { flush: () => void } {
  let lastCall = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: A | null = null

  const run = () => {
    lastCall = Date.now()
    const args = pending
    pending = null
    if (args) fn(...args)
  }

  const wrapped = (...args: A) => {
    const now = Date.now()
    const elapsed = now - lastCall
    if (elapsed >= waitMs) {
      lastCall = now
      fn(...args)
      return
    }
    pending = args
    if (timer === null) {
      timer = setTimeout(() => {
        timer = null
        run()
      }, waitMs - elapsed)
    }
  }

  wrapped.flush = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    if (pending) run()
  }

  return wrapped
}
