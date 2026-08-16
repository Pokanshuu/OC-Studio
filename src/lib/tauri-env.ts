"use client"

import { isTauri } from './env'

export function detectTauriMica() {
  if (typeof window === "undefined") return

  try {
    if (isTauri()) {
      document.documentElement.classList.add("tauri-mica")
    }
  } catch {
    // browser environment, no-op
  }
}
