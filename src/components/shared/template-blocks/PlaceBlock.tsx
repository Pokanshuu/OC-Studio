'use client'

/**
 * 地点组件（`docs/模板.md §6.8`）：一行自由文本。
 *
 * 未来接地图时在这里加右侧「在地图中查看」；现在不画占位、不做假建议。
 */
import { FIELD_INPUT } from '@/lib/ui-tokens'
import { ComponentSection } from '../ComponentSection'

interface PlaceBlockProps {
  value: string
  onChange: (value: string) => void
  showTitle?: boolean
  title?: string
  placeholder?: string
}

export function PlaceBlock({
  value,
  onChange,
  showTitle = true,
  title = '地点',
  placeholder = '例：灰烬平原',
}: PlaceBlockProps) {
  return (
    <ComponentSection title={showTitle ? title : undefined}>
      <div className="flex max-w-md items-center gap-1 border-b border-line pb-1">
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={title}
          className={FIELD_INPUT}
        />
      </div>
    </ComponentSection>
  )
}
