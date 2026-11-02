'use client'

import { ArrowLeft, Link2 } from 'lucide-react'
import { useCharacterList } from '@/features/characters/hooks/useCharacters'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { useEventList } from '@/features/events/hooks/useEvents'
import type { CustomSection } from './store'

interface CustomSectionGraphProps {
  section: CustomSection
  onBack: () => void
  onSelectEntry: (entryId: string) => void
}

interface GraphNode {
  key: string
  label: string
  kind: 'entry' | 'character' | 'country' | 'event'
  y: number
}

export function CustomSectionGraph({ section, onBack, onSelectEntry }: CustomSectionGraphProps) {
  const { characters } = useCharacterList()
  const { countries } = useCountryList()
  const { events } = useEventList()

  const entries: GraphNode[] = section.entries.map((entry, index) => ({
    key: `entry:${entry.id}`,
    label: entry.name,
    kind: 'entry',
    y: 32 + index * 104,
  }))

  const related = new Map<string, GraphNode>()
  for (const entry of section.entries) {
    for (const id of entry.characterIds) {
      const character = characters.find((item) => item.id === id)
      if (character) {
        related.set(`character:${id}`, {
          key: `character:${id}`,
          label: character.name,
          kind: 'character',
          y: 0,
        })
      }
    }
    for (const id of entry.countryIds) {
      const country = countries.find((item) => item.id === id)
      if (country) {
        related.set(`country:${id}`, {
          key: `country:${id}`,
          label: country.name,
          kind: 'country',
          y: 0,
        })
      }
    }
    for (const id of entry.eventIds) {
      const event = events.find((item) => item.id === id)
      if (event) {
        related.set(`event:${id}`, {
          key: `event:${id}`,
          label: event.title,
          kind: 'event',
          y: 0,
        })
      }
    }
  }
  const relatedNodes = [...related.values()].map((node, index) => ({
    ...node,
    y: 32 + index * 86,
  }))

  const entryMap = new Map(entries.map((node) => [node.key, node]))
  const relatedMap = new Map(relatedNodes.map((node) => [node.key, node]))
  const edges: Array<{ id: string; from: GraphNode; to: GraphNode; label: string }> = []
  for (const entry of section.entries) {
    for (const id of entry.characterIds) {
      const from = entryMap.get(`entry:${entry.id}`)
      const to = relatedMap.get(`character:${id}`)
      if (!from || !to) continue
      const meta = entry.characterLinks[String(id)]
      edges.push({
        id: `${entry.id}:character:${id}`,
        from,
        to,
        label: meta?.role || meta?.relation || '相关',
      })
    }
    for (const id of entry.countryIds) {
      const from = entryMap.get(`entry:${entry.id}`)
      const to = relatedMap.get(`country:${id}`)
      if (!from || !to) continue
      const meta = entry.countryLinks[String(id)]
      edges.push({
        id: `${entry.id}:country:${id}`,
        from,
        to,
        label: meta?.relation || '相关',
      })
    }
    for (const id of entry.eventIds) {
      const from = entryMap.get(`entry:${entry.id}`)
      const to = relatedMap.get(`event:${id}`)
      if (!from || !to) continue
      edges.push({ id: `${entry.id}:event:${id}`, from, to, label: '相关' })
    }
  }

  const height = Math.max(360, Math.max(entries.length * 104, relatedNodes.length * 86) + 80)
  const left = 24
  const right = 430
  const width = 720

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-6 py-3">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-ink-muted hover:text-ink" title="返回">
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          <h2 className="font-serif text-lg text-ink">{section.name} · 关系网</h2>
        </div>
        <span className="flex items-center gap-1 text-[10px] text-ink-faint">
          <Link2 size={12} strokeWidth={2} />
          {edges.length} 条关系
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="relative" style={{ width, height }}>
          <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
            {edges.map((edge) => {
              const y1 = edge.from.y + 28
              const y2 = edge.to.y + 28
              const midX = (left + 180 + right) / 2
              return (
                <g key={edge.id}>
                  <path
                    d={`M${left + 180} ${y1} C${midX} ${y1} ${midX} ${y2} ${right} ${y2}`}
                    fill="none"
                    stroke="var(--color-line-hover)"
                    strokeWidth={1}
                  />
                  <text
                    x={midX}
                    y={(y1 + y2) / 2 - 4}
                    textAnchor="middle"
                    fontSize={9}
                    fill="var(--color-ink-faint)"
                  >
                    {edge.label}
                  </text>
                </g>
              )
            })}
          </svg>

          {entries.map((node) => (
            <button
              key={node.key}
              onClick={() => onSelectEntry(node.key.slice('entry:'.length))}
              className="absolute flex w-[180px] flex-col rounded-xl border border-ink/25 bg-paper-card px-3 py-2 text-left shadow-sm hover:border-ink/50"
              style={{ left, top: node.y }}
            >
              <span className="text-[9px] uppercase tracking-widest text-ink-faint">
                {section.name}
              </span>
              <span className="mt-0.5 truncate font-serif text-sm text-ink">{node.label}</span>
            </button>
          ))}

          {relatedNodes.map((node) => (
            <div
              key={node.key}
              className="absolute flex w-[200px] items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 shadow-sm"
              style={{ left: right, top: node.y }}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  node.kind === 'character'
                    ? 'bg-[#7C9A84]'
                    : node.kind === 'country'
                      ? 'bg-[#B36651]'
                      : 'bg-[#8B7BA8]'
                }`}
              />
              <span className="truncate text-xs text-ink">{node.label}</span>
              <span className="ml-auto text-[9px] text-ink-faint">
                {node.kind === 'character' ? '人物' : node.kind === 'country' ? '国家' : '事件'}
              </span>
            </div>
          ))}

          {relatedNodes.length === 0 ? (
            <p className="absolute text-xs text-ink-faint" style={{ left: right, top: 32 }}>
              还没有关联内容
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
