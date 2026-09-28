'use client'

import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { Avatar } from '@/components/shared/Avatar'
import { getImageUrl } from '@/lib/image-service'
import { useProjectMeta } from '@/features/project'
import { useCharacterList } from '@/features/characters/hooks/useCharacters'
import { useEventList } from '@/features/events/hooks/useEvents'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { useEntryList } from '@/features/world/hooks/useWorldEntries'
import { PAGE_TITLE, SECTION_TITLE } from '@/lib/ui-tokens'

interface DashboardProps {
  /** 打开某个实体 */
  onNavigate: (id: number, type: string) => void
  /** 切换到某个板块（角色 / 事件 / 国家 / 世界观 / 时间线 / 关系图 / 相册） */
  onOpenSection: (item: string) => void
}

type RecentType = 'character' | 'event' | 'country' | 'world'

const TYPE_LABEL: Record<RecentType, string> = {
  character: '角色',
  event: '事件',
  country: '国家',
  world: '词条',
}

function relativeTime(ts: number): string {
  if (!ts) return '—'
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} 个月前`
  return `${Math.floor(months / 12)} 年前`
}

function requestCreate(type: 'character' | 'event' | 'country') {
  window.dispatchEvent(new CustomEvent('oc:create-entity', { detail: { type } }))
}

/**
 * 概览（第一屏）。
 * 只呈现「世界是谁 + 有多少东西 + 最近在做什么」，不放图表不放卡片墙。
 */
export function Dashboard({ onNavigate, onOpenSection }: DashboardProps) {
  const { meta } = useProjectMeta()
  const { characters } = useCharacterList()
  const { events } = useEventList()
  const { countries } = useCountryList()
  const { entries } = useEntryList()

  const majorCharacters = useMemo(
    () => characters.filter((c) => c.isMajor),
    [characters],
  )

  const recent = useMemo(() => {
    const all: { id: number; type: RecentType; name: string; updatedAt: number }[] = [
      ...characters.map((c) => ({ id: c.id, type: 'character' as const, name: c.name, updatedAt: c.updatedAt })),
      ...events.map((e) => ({ id: e.id, type: 'event' as const, name: e.title, updatedAt: e.updatedAt })),
      ...countries.map((c) => ({ id: c.id, type: 'country' as const, name: c.name, updatedAt: c.updatedAt })),
      ...entries.map((e) => ({ id: e.id, type: 'world' as const, name: e.title, updatedAt: e.updatedAt })),
    ].filter((x) => typeof x.id === 'number')

    return all.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)).slice(0, 6)
  }, [characters, events, countries, entries])

  const stats: { label: string; value: number; item: string }[] = [
    { label: '角色', value: characters.length, item: '角色' },
    { label: '事件', value: events.length, item: '事件' },
    { label: '国家', value: countries.length, item: '国家' },
    { label: '词条', value: entries.length, item: '世界观' },
  ]

  const isEmpty =
    characters.length === 0 && events.length === 0 && countries.length === 0 && entries.length === 0

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-3xl px-6 py-12 md:px-8 md:py-16">
        {/* 世界 */}
        <header className="flex flex-col gap-2">
          <span className="text-[11px] tracking-[0.14em] text-ink-faint">当前世界</span>
          <h1 className={PAGE_TITLE}>
            {meta.worldName.trim() || '未命名世界'}
          </h1>
          {meta.tagline.trim() ? (
            <p className="max-w-xl text-[13px] leading-relaxed text-ink-muted">{meta.tagline}</p>
          ) : null}
        </header>

        {/* 概览数字：行自带 px-2，外层 -mx-2 抵消，保证文字仍与上方标题对齐 */}
        <div className="mt-10 -mx-2 grid grid-cols-2 gap-x-10 sm:grid-cols-4">
          {stats.map((s) => (
            <button
              key={s.label}
              onClick={() => onOpenSection(s.item)}
              className="group flex items-baseline justify-between border-b border-line px-2 py-2 text-left"
            >
              <span className="text-[13px] text-ink-muted transition-colors group-hover:text-ink">{s.label}</span>
              <span className="font-serif text-[15px] text-ink tabular-nums">{s.value}</span>
            </button>
          ))}
        </div>

        {/* 主要角色 */}
        <section className="mt-12">
          <h2 className={SECTION_TITLE}>主要角色</h2>
          {majorCharacters.length > 0 ? (
            <div className="-mx-1 flex flex-wrap gap-x-4 gap-y-4">
              {majorCharacters.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onNavigate(c.id, 'character')}
                  className="flex w-16 flex-col items-center gap-1.5 px-1 py-0.5"
                  title={c.name}
                >
                  <Avatar src={getImageUrl(c.avatarUrl, 'avatar')} size="md" alt={c.name} />
                  <span className="w-full truncate text-center text-[12px] text-ink-muted transition-colors hover:text-ink">
                    {c.name}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="font-serif text-sm text-ink-faint">还没有标记主要角色</p>
          )}
        </section>

        {/* 最近更新 */}
        <section className="mt-12">
          <h2 className={SECTION_TITLE}>最近更新</h2>
          {recent.length > 0 ? (
            <div className="-mx-2 flex flex-col">
              {recent.map((r) => (
                <button
                  key={`${r.type}-${r.id}`}
                  onClick={() => onNavigate(r.id, r.type)}
                  className="flex items-center gap-4 border-b border-line px-2 py-2 text-left transition-colors hover:bg-[var(--oc-hover)]"
                >
                  <span className="w-8 shrink-0 text-[11px] text-ink-faint">{TYPE_LABEL[r.type]}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{r.name}</span>
                  <span className="shrink-0 text-[11px] text-ink-faint tabular-nums">{relativeTime(r.updatedAt)}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="font-serif text-sm text-ink-faint">还没有内容</p>
          )}
        </section>

        {/* 起步 */}
        {isEmpty ? (
          <section className="mt-12">
            <h2 className={SECTION_TITLE}>从这里开始</h2>
            <div className="-mx-1.5 flex flex-wrap items-center gap-x-5 gap-y-2">
              {([
                { label: '新建角色', type: 'character' as const },
                { label: '新建事件', type: 'event' as const },
                { label: '新建国家', type: 'country' as const },
              ]).map((a) => (
                <button
                  key={a.type}
                  onClick={() => requestCreate(a.type)}
                  className="flex items-center gap-1.5 border-b border-line px-1.5 py-1 text-[13px] text-ink-muted transition-colors hover:border-ink hover:text-ink"
                >
                  <Plus size={13} strokeWidth={2} />
                  {a.label}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
