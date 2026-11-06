'use client'

/**
 * 标注的「线条色 / 填充色」面板（右键一条国界或道路 →「颜色」）。
 *
 * 为什么要有它：标注压在**用户自己的底图**上，一道深墨线在深色海面上会糊掉、
 * 一道浅色线在米色陆地上会消失。所以颜色必须可调，而不是跟着主题走。
 *
 * 色板不是新的：直接用 `RELATION_COLORS` 那 12 档（与关系图同一套名字与令牌），
 * 落盘存中文名，Obsidian 里也能看懂。
 */
import { MenuSurface } from '@/components/shared/menu/MenuSurface'
import { MENU_GROUP_LABEL } from '@/lib/ui-tokens'
import { RELATION_COLORS, relationColorValue } from '@/lib/relation-colors'
import type { MapAnnotation } from '../annotations'

interface AnnotationColorMenuProps {
  target: MapAnnotation
  at: { x: number; y: number }
  onClose: () => void
  /** `undefined` = 回到默认（线条固定深墨） */
  onColor: (color: string | undefined) => void
  /** 只对国界有效；`undefined` = 无填充 */
  onFill: (fill: string | undefined) => void
}

export function AnnotationColorMenu({ target, at, onClose, onColor, onFill }: AnnotationColorMenuProps) {
  return (
    <MenuSurface at={at} onClose={onClose} width={216} ariaLabel="标注颜色">
      <p className={MENU_GROUP_LABEL}>线条</p>
      <Swatches selected={target.color} clearLabel="默认" onPick={onColor} />

      {target.kind === 'border' ? (
        <>
          <div className="mx-2 my-1 h-px bg-line" />
          <p className={MENU_GROUP_LABEL}>填充</p>
          <Swatches selected={target.fill} clearLabel="无填充" onPick={onFill} />
        </>
      ) : null}
    </MenuSurface>
  )
}

function Swatches({
  selected,
  clearLabel,
  onPick,
}: {
  selected: string | undefined
  clearLabel: string
  onPick: (color: string | undefined) => void
}) {
  return (
    <div className="pb-2">
      <button
        type="button"
        onClick={() => onPick(undefined)}
        className="mb-2 flex w-full items-center justify-between px-3 py-0.5 text-left text-[12px] text-ink-muted transition-colors hover:text-ink"
      >
        <span>{clearLabel}</span>
        {!selected ? <span className="text-[11px] text-ink-faint">当前</span> : null}
      </button>
      <div className="grid grid-cols-6 gap-1.5 px-3">
        {RELATION_COLORS.map((color) => {
          const active = selected === color.name
          return (
            <button
              key={color.name}
              type="button"
              aria-label={color.name}
              aria-pressed={active}
              title={color.name}
              onClick={() => onPick(color.name)}
              className={`h-5 w-5 rounded-full border transition-colors ${
                active ? 'border-ink' : 'border-transparent hover:border-line-hover'
              }`}
              style={{ backgroundColor: relationColorValue(color.name) }}
            />
          )
        })}
      </div>
    </div>
  )
}
