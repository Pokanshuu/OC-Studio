"use client"

export function detectTauriMica() {
  if (typeof window === "undefined") return

  try {
    const isTauri = "__TAURI_INTERNALS__" in window || "__TAURI__" in window
    if (isTauri) {
      document.documentElement.classList.add("tauri-mica")
    }
  } catch {
    // browser environment, no-op
  }
}
