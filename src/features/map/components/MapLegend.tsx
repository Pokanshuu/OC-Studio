'use client'

/**
 * 地图图例：告诉用户屏幕上那些颜色是什么（`docs/地图.md` §10）。
 *
 * 色值**照抄渲染器**：`plugins/map-generator/kernel/render.ts` 里的
 * `TEMP_STOPS` / `MOISTURE_STOPS` / 地形色阶、以及 `BIOME_COLORS`。
 * 图例一旦自己配色就会和地图像素对不上，那比没有图例更糟 ——
 * 改渲染色阶时这里要同步改（两处都是「图自己的调色板」，不是界面令牌）。
 *
 * 只放色块与两端标签，不写说明句：标签本身已经说明了一切（约束 13）。
 */
import { BIOME_COLORS, BIOME_NAMES } from '@/plugins/map-generator'
import { PANEL } from '@/lib/ui-tokens'

const DEEP_OCEAN = 'rgb(20 40 52)'
const SHALLOW_OCEAN = 'rgb(77 118 128)'
const BEACH = 'rgb(211 195 157)'
const ROCK = 'rgb(139 133 121)'
const SNOW = 'rgb(225 223 215)'

const TERRAIN_RAMP = `linear-gradient(90deg, ${DEEP_OCEAN}, ${SHALLOW_OCEAN} 34%, ${BEACH} 48%, ${ROCK} 74%, ${SNOW})`

const TEMP_RAMP =
  'linear-gradient(90deg, rgb(48 61 103), rgb(96 144 158) 40%, rgb(152 174 128) 55%, rgb(206 181 105) 70%, rgb(197 119 82) 85%, rgb(153 72 61))'

const MOISTURE_RAMP =
  'linear-gradient(90deg, rgb(197 178 124), rgb(148 161 98) 40%, rgb(103 145 96) 65%, rgb(65 127 111) 82%, rgb(46 101 126))'

function Ramp({ gradient, from, to }: { gradient: string; from: string; to: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="h-2 w-full rounded-item border border-line" style={{ background: gradient }} />
      <div className="flex justify-between text-[11px] text-ink-faint">
        <span>{from}</span>
        <span>{to}</span>
      </div>
    </div>
  )
}

export function MapLegend({ view }: { view: string }) {
  return (
    <div className={`pointer-events-auto w-[168px] p-2 ${PANEL}`} role="note" aria-label="图例">
      {view === 'biome' ? (
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          {BIOME_NAMES.map((name, index) => (
            <div key={name} className="flex min-w-0 items-center gap-1">
              <span
                className="h-2 w-2 shrink-0 rounded-item"
                style={{ background: BIOME_COLORS[index] ?? 'transparent' }}
              />
              <span className="truncate text-[11px] text-ink-muted">{name}</span>
            </div>
          ))}
        </div>
      ) : view === 'political' ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-4 shrink-0 rounded-item border border-line bg-[var(--oc-hover)]" />
            <span className="text-[11px] text-ink-muted">国界</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="16" height="2" aria-hidden>
              <line x1="0" y1="1" x2="16" y2="1" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" />
            </svg>
            <span className="text-[11px] text-ink-muted">道路</span>
          </div>
        </div>
      ) : view === 'temperature' ? (
        <Ramp gradient={TEMP_RAMP} from="−30℃" to="42℃" />
      ) : view === 'moisture' ? (
        <Ramp gradient={MOISTURE_RAMP} from="干旱" to="湿润" />
      ) : (
        <Ramp gradient={TERRAIN_RAMP} from="低" to="高" />
      )}
    </div>
  )
}
