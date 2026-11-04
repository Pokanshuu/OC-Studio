const ACCENT_PALETTE = [
  '#B36651',
  '#5E8B74',
  '#8B7BA8',
  '#C49A4A',
  '#6A8FA8',
  '#A77B62',
  '#7C8B6A',
  '#9C6B7D',
]

function hash(value: string): number {
  let result = 0
  for (let i = 0; i < value.length; i++) {
    result = (result * 31 + value.charCodeAt(i)) >>> 0
  }
  return result
}

export function pickAccentColor(seed = ''): string {
  if (!seed) return ACCENT_PALETTE[Math.floor(Math.random() * ACCENT_PALETTE.length)]
  return ACCENT_PALETTE[hash(seed) % ACCENT_PALETTE.length]
}

export function resolveAccentColor(value: string | undefined, seed: string): string {
  return value || pickAccentColor(seed)
}

export function accentGradient(color: string): string {
  return `linear-gradient(135deg, ${color}24 0%, ${color}0D 55%, transparent 100%)`
}

export function accentBorder(color: string): string {
  return `${color}55`
}

export function accentText(color: string): string {
  return color
}
