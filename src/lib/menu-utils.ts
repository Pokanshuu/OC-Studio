const GAP = 8

export interface AdjustedPosition {
  x: number
  y: number
}

export function adjustSuggestionPosition(
  rect: { left: number; bottom: number; top: number },
  popupWidth: number,
  popupHeight: number,
): AdjustedPosition {
  const vw = window.innerWidth
  const vh = window.innerHeight

  let x = rect.left
  let y = rect.bottom + 4

  // horizontal overflow: shift left
  if (x + popupWidth > vw - GAP) {
    x = Math.max(GAP, vw - popupWidth - GAP)
  }
  if (x < GAP) {
    x = GAP
  }

  // vertical overflow: try above cursor first, otherwise pin inside the viewport
  // （以前直接甩到 GAP，光标贴底时菜单会「闪到左上角」）
  if (y + popupHeight > vh - GAP) {
    const aboveY = rect.top - popupHeight - 4
    y = aboveY >= GAP ? aboveY : Math.max(GAP, vh - popupHeight - GAP)
  }
  if (y < GAP) {
    y = GAP
  }

  return { x, y }
}
