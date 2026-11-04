'use client'

/**
 * 地图图层开关（M1）：控制国家 / 事件 / 词条三层锚点的显隐。
 *
 * 只是一个「多选下拉」：触发按钮在页头，面板 portal 到 `#overlay-root`。
 * 图层状态由 `MapView` 持有（会话内偏好），这里不读不写任何存储。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Layers } from 'lucide-react'
import {
  FILTER_TRIGGER,
  MENU,
  MENU_ITEM_BASE,
  MENU_GROUP_LABEL,
} from '@/lib/ui-tokens'
import { MAP_LAYER_LABELS, type MapLayerKind, type MapLayerState } from '../types'

export interface MapLayerMenuProps {
  layers: readonly MapLayerState[]
  onToggle: (kind: MapLayerKind) => void
  disabled?: boolean
}

export function MapLayerMenu({ layers, onToggle, disabled = false }: MapLayerMenuProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])

  const toggle = () => {
    if (open) {
      close()
      return
    }
    const trigger = triggerRef.current
    if (trigger) {
      const rect = trigger.getBoundingClientRect()
      setPosition({
        left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - 176 - 8)),
        top: rect.bottom + 4,
      })
    }
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) === true) return
      if (panelRef.current?.contains(target) === true) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onResize = () => setOpen(false)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const overlayRoot = typeof document === 'undefined' ? null : document.getElementById('overlay-root')

  const panel = (
    <div
      ref={panelRef}
      role="menu"
      aria-label="图层"
      className={`fixed z-40 flex w-44 max-w-[calc(100vw-1rem)] flex-col ${MENU}`}
      style={{ left: position.left, top: position.top }}
    >
      <p className={MENU_GROUP_LABEL}>图层</p>
      {layers.map((layer) => (
        <button
          key={layer.kind}
          type="button"
          role="menuitemcheckbox"
          aria-checked={layer.visible}
          onClick={() => onToggle(layer.kind)}
          className={`${MENU_ITEM_BASE} text-ink hover:bg-[var(--oc-hover)]`}
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
            {layer.visible ? <Check size={13} strokeWidth={2} /> : null}
          </span>
          <span className="min-w-0 flex-1 truncate">{MAP_LAYER_LABELS[layer.kind]}</span>
        </button>
      ))}
    </div>
  )

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        className={FILTER_TRIGGER}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Layers size={14} strokeWidth={2} />
        <span>图层</span>
        <ChevronDown size={14} strokeWidth={2} />
      </button>
      {open && overlayRoot !== null ? createPortal(panel, overlayRoot) : null}
    </>
  )
}
