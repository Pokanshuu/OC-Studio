"use client"

import { Toaster as Sonner } from "sonner"

export function Toaster() {
  return (
    <Sonner
      position="bottom-left"
      toastOptions={{
        style: {
          background: "var(--color-paper-card)",
          border: "1px solid var(--color-line)",
          color: "var(--color-ink)",
          fontSize: "12px",
          borderRadius: "4px",
          boxShadow: "none",
        },
      }}
    />
  )
}
