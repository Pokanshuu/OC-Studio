'use client'

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useCustomSections } from '@/features/custom-sections'

type EntityType = 'character' | 'country' | 'event'

const LINK_FIELD = {
  character: 'characterIds',
  country: 'countryIds',
  event: 'eventIds',
} as const

const META_FIELD = {
  character: 'characterLinks',
  country: 'countryLinks',
  event: 'eventLinks',
} as const

export function CustomEntryLinks({
  entityType,
  entityId,
}: {
  entityType: EntityType
  entityId: number
}) {
  const { sections, linkEntity, unlinkEntity, updateEntry } = useCustomSections()
  const [selected, setSelected] = useState('')

  const linkField = LINK_FIELD[entityType]
  const metaField = META_FIELD[entityType]

  const linked = useMemo(
    () =>
      sections.flatMap((section) =>
        section.entries
          .filter((entry) => entry[linkField].includes(entityId))
          .map((entry) => ({ section, entry })),
      ),
    [entityId, linkField, sections],
  )

  const available = useMemo(
    () =>
      sections.flatMap((section) =>
        section.entries
          .filter((entry) => !entry[linkField].includes(entityId))
          .map((entry) => ({ section, entry })),
      ),
    [entityId, linkField, sections],
  )

  if (sections.length === 0) return null

  return (
    <section>
      <h3 className="text-base text-ink mb-3">相关自定义分类</h3>
      <div className="flex gap-2">
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          className="h-9 min-w-0 flex-1 rounded border border-line bg-paper-card px-3 text-sm text-ink outline-none focus:border-line-hover"
        >
          <option value="">选择分类下的条目</option>
          {sections.map((section) => {
            const options = available.filter((item) => item.section.id === section.id)
            if (options.length === 0) return null
            return (
              <optgroup key={section.id} label={section.name}>
                {options.map(({ entry }) => (
                  <option key={entry.id} value={`${section.id}:${entry.id}`}>
                    {entry.name}
                  </option>
                ))}
              </optgroup>
            )
          })}
        </select>
        <button
          onClick={() => {
            if (!selected) return
            const [sectionId, entryId] = selected.split(':')
            if (sectionId && entryId && Number.isFinite(entityId)) {
              linkEntity(sectionId, entryId, linkField, entityId)
            }
            setSelected('')
          }}
          disabled={!selected}
          className="flex h-9 items-center gap-1 rounded border border-line px-3 text-sm text-ink-muted hover:border-line-hover hover:text-ink disabled:opacity-40"
        >
          <Plus size={13} strokeWidth={2} />
          关联
        </button>
      </div>

      {linked.length > 0 ? (
        <div className="mt-3 space-y-2">
          {linked.map(({ section, entry }) => {
            const meta = entry[metaField]?.[String(entityId)] ?? {}
            return (
              <div key={entry.id} className="rounded-lg border border-line bg-paper-card p-2.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-ink">
                    <span className="text-ink-faint">{section.name} · </span>
                    {entry.name}
                  </span>
                  <button
                    onClick={() => unlinkEntity(section.id, entry.id, linkField, entityId)}
                    className="text-ink-faint hover:text-error"
                    title="取消关联"
                  >
                    ×
                  </button>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <input
                    value={meta.relation ?? ''}
                    onChange={(event) =>
                      updateEntry(section.id, entry.id, {
                        [metaField]: {
                          ...(entry[metaField] ?? {}),
                          [String(entityId)]: { ...meta, relation: event.target.value },
                        },
                      })
                    }
                    placeholder="关系，例如：信仰、成员"
                    className="h-8 rounded border border-line bg-paper px-2 text-xs text-ink outline-none placeholder:text-ink-faint"
                  />
                  <input
                    value={meta.position ?? ''}
                    onChange={(event) =>
                      updateEntry(section.id, entry.id, {
                        [metaField]: {
                          ...(entry[metaField] ?? {}),
                          [String(entityId)]: { ...meta, position: event.target.value },
                        },
                      })
                    }
                    placeholder="自定义内容，添加你的描述"
                    className="h-8 rounded border border-line bg-paper px-2 text-xs text-ink outline-none placeholder:text-ink-faint"
                  />
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
