'use client'

/**
 * 地图「图层」浮层 —— 苹果地图那种整屏画布上的一个卡片，不是工具栏。
 *
 * 为什么放进浮层：地图页没有页头、没有工具栏，操作只能是**压在画布上**的。
 * 左下角一个「图层」胶囊，点开是这张卡片（显示 / 操作两组）。
 */
import { ChevronDown, Library, MapPin, ImageDown, Wand2, Upload, X } from 'lucide-react'
import { MAP_LAYER_LABELS, type MapLayerKind, type MapLayerState } from '../types'
import { BTN_QUIET, ICON_BTN, MENU_GROUP_LABEL, PANEL } from '@/lib/ui-tokens'
import { CheckboxBox } from '@/components/ui/checkbox'

interface MapModeCardProps {
  layers: readonly MapLayerState[]
  onToggleLayer: (kind: MapLayerKind) => void
  onClose: () => void
  /** 编辑态才显示「操作」那一组 */
  canEdit: boolean
  hasMap: boolean
  hasImage: boolean
  exporting: boolean
  onAddAnchor: () => void
  onPickBackground: () => void
  onRemoveBackground: () => void
  onGenerate: () => void
  onExport: () => void
  /** 当前地图名：卡片顶部就是「地图选择器」的入口 */
  mapName: string
  onOpenSwitcher: () => void
  onOpenLibrary: () => void
}

export function MapModeCard({
  layers,
  onToggleLayer,
  onClose,
  canEdit,
  hasMap,
  hasImage,
  exporting,
  onAddAnchor,
  onPickBackground,
  onRemoveBackground,
  onGenerate,
  onExport,
  mapName,
  onOpenSwitcher,
  onOpenLibrary,
}: MapModeCardProps) {
  return (
    <div className={`pointer-events-auto w-[240px] p-2 ${PANEL}`} role="dialog" aria-label="地图图层">
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          onClick={onOpenSwitcher}
          className="flex min-w-0 flex-1 items-center gap-1 rounded-item px-1.5 py-1 text-left text-[13px] text-ink transition-colors hover:bg-[var(--oc-hover)]"
        >
          <span className="min-w-0 flex-1 truncate">{mapName}</span>
          <ChevronDown size={13} strokeWidth={2} className="shrink-0 text-ink-faint" />
        </button>
        <button type="button" onClick={onOpenLibrary} className={`${ICON_BTN} hover:text-ink`} aria-label="地图库">
          <Library size={13} strokeWidth={2} />
        </button>
        <button type="button" onClick={onClose} className={`${ICON_BTN} hover:text-ink`} aria-label="关闭">
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      <div className={`flex items-center pl-1.5 ${MENU_GROUP_LABEL}`}>显示</div>

      <div className="flex flex-col">
        {layers.map((layer) => (
          <button
            key={layer.kind}
            type="button"
            onClick={() => onToggleLayer(layer.kind)}
            aria-pressed={layer.visible}
            className="flex items-center gap-2 rounded-item px-1.5 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-[var(--oc-hover)]"
          >
            <CheckboxBox checked={layer.visible} />
            <span className="min-w-0 flex-1 truncate">{MAP_LAYER_LABELS[layer.kind]}</span>
            <span className="shrink-0 text-[11px] text-ink-faint">{layer.visible ? '显示' : '隐藏'}</span>
          </button>
        ))}
      </div>

      {canEdit ? (
        <>
          <div className={`mt-1 ${MENU_GROUP_LABEL}`}>编辑</div>
          <div className="flex flex-col">
            <ActionRow icon={<MapPin size={13} strokeWidth={2} />} label="添加锚点" disabled={!hasMap} onClick={onAddAnchor} />
            <ActionRow icon={<Upload size={13} strokeWidth={2} />} label="设置底图" disabled={!hasMap} onClick={onPickBackground} />
            {hasImage ? (
              <ActionRow
                icon={<Upload size={13} strokeWidth={2} />}
                label="移除底图"
                disabled={!hasMap}
                onClick={onRemoveBackground}
              />
            ) : null}
            <ActionRow icon={<Wand2 size={13} strokeWidth={2} />} label="生成地图" disabled={!hasMap} onClick={onGenerate} />
            <ActionRow
              icon={<ImageDown size={13} strokeWidth={2} />}
              label={exporting ? '导出中…' : '导出图片'}
              disabled={!hasImage || exporting}
              onClick={onExport}
            />
          </div>
        </>
      ) : null}
    </div>
  )
}

function ActionRow({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${BTN_QUIET} w-full justify-start rounded-item px-1.5 text-[13px] disabled:opacity-40`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )
}
