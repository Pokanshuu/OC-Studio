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

  // vertical overflow: try above cursor first
  if (y + popupHeight > vh - GAP) {
    const aboveY = rect.top - popupHeight - 4
    if (aboveY >= GAP) {
      y = aboveY
    } else {
      y = GAP
    }
  }

  return { x, y }
}

export function adjustContextMenuPosition(
  mouseX: number,
  mouseY: number,
  menuWidth: number,
  menuHeight: number,
): AdjustedPosition {
  const vw = window.innerWidth
  const vh = window.innerHeight

  let x = mouseX
  let y = mouseY

  if (x + menuWidth > vw - GAP) {
    x = Math.max(GAP, mouseX - menuWidth)
  }
  if (x < GAP) {
    x = GAP
  }

  if (y + menuHeight > vh - GAP) {
    y = Math.max(GAP, mouseY - menuHeight)
  }
  if (y < GAP) {
    y = GAP
  }

  return { x, y }
}

export function adjustSubMenuPosition(
  parentRect: DOMRect,
  subMenuWidth: number,
  subMenuHeight: number,
): { xOffset: number; yOffset: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight

  const defaultX = parentRect.right + 4
  const defaultY = parentRect.top

  let x = defaultX
  let y = defaultY

  // if sub-menu overflows right edge, flip to left
  if (x + subMenuWidth > vw - GAP) {
    x = parentRect.left - subMenuWidth - 4
    if (x < GAP) {
      x = GAP
    }
  }

  // if sub-menu overflows bottom edge, shift up
  if (y + subMenuHeight > vh - GAP) {
    y = Math.max(GAP, vh - subMenuHeight - GAP)
  }

  return { xOffset: x - parentRect.left, yOffset: y - parentRect.top }
}
