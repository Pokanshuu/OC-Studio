/**
 * Token count **estimate** — deliberately not a real tokenizer.
 *
 * * A real tokenizer is exact only for its own model; switch providers and it is
 *   wrong anyway.
 * * It is big and slow, and all we need here is "how full is the window" (12k or
 *   120k), never billing precision.
 *
 * CJK and non-CJK are weighted separately: Chinese is ≈1 token / 1.5 chars and
 * English ≈1 token / 4 chars — a 2.7× difference, so a single constant would be
 * off by more than 2× for pure-Chinese or pure-English content.
 */

const CHARS_PER_TOKEN_LATIN = 4.0
const CHARS_PER_TOKEN_CJK = 1.5

/** Han, Hiragana, Katakana, Hangul. Approximate on purpose. */
function isCjk(code: number): boolean {
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK unified ideographs
    (code >= 0x3400 && code <= 0x4dbf) || // extension A
    (code >= 0x3040 && code <= 0x30ff) || // hiragana / katakana
    (code >= 0xac00 && code <= 0xd7af) // hangul
  )
}

export function estimateTokens(text: string): number {
  if (!text) return 0
  let cjk = 0
  let other = 0
  for (let i = 0; i < text.length; i++) {
    if (isCjk(text.charCodeAt(i))) cjk++
    else other++
  }
  const tokens = cjk / CHARS_PER_TOKEN_CJK + other / CHARS_PER_TOKEN_LATIN
  // A non-empty string can never be 0 tokens.
  return Math.max(1, Math.round(tokens))
}

/** Sum over several texts **before** rounding, so the total does not drift. */
export function estimateTokensOfAll(texts: Iterable<string>): number {
  let cjk = 0
  let other = 0
  for (const text of texts) {
    for (let i = 0; i < text.length; i++) {
      if (isCjk(text.charCodeAt(i))) cjk++
      else other++
    }
  }
  if (cjk === 0 && other === 0) return 0
  return Math.max(1, Math.round(cjk / CHARS_PER_TOKEN_CJK + other / CHARS_PER_TOKEN_LATIN))
}

function trimZero(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

/** Compact human form: `12k` / `1.2M` / `980` — the ring has room for ~4 chars. */
export function formatTokens(count: number): string {
  if (count < 1000) return String(count)
  if (count < 1_000_000) {
    const k = count / 1000
    return k < 10 ? `${trimZero(k)}k` : `${Math.round(k)}k`
  }
  return `${trimZero(count / 1_000_000)}M`
}
