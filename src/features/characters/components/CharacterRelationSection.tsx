'use client'

import { X } from 'lucide-react'
import { RelatedItemsSelector } from '@/components/shared/RelatedItemsSelector'
import { CHIP, SECTION_TITLE_BARE } from '@/lib/ui-tokens'
import type { CharacterForm } from '../hooks/useCharacterForm'

// 关系表表头
const REL_TH = 'pb-2 text-left text-[11px] font-normal tracking-[0.14em] text-ink-faint'

export function CharacterRelationSection({
  form,
  onNavigateToCharacter,
  presentation = 'table',
  showTitle = true,
}: {
  form: CharacterForm
  onNavigateToCharacter?: (id: number) => void
  /** 模板参数 `relations.presentation`：表格（默认）/ 紧凑 */
  presentation?: 'table' | 'compact'
  /** 模板参数 `relations.title`：关掉标题行时仍保留添加入口 */
  showTitle?: boolean
}) {
  const {
    relatedCharacters,
    setRelatedCharacters,
    relatedCharacterIds,
    handleRelatedCharactersChange,
    inboundRelations,
  } = form

  return (
    <section>
      <div className={`mb-3 flex items-center gap-4 ${showTitle ? 'justify-between' : 'justify-end'}`}>
        {showTitle ? <h3 className={SECTION_TITLE_BARE}>关系</h3> : null}
        <RelatedItemsSelector
          items={form.characterItems}
          selectedIds={relatedCharacterIds}
          onChange={handleRelatedCharactersChange}
          placeholder="添加关联角色..."
          onNavigateItem={onNavigateToCharacter}
          hideSelected
          panelAlign="right"
        />
      </div>

      {relatedCharacters.length > 0 && presentation === 'compact' ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {relatedCharacters.map((rc, idx) => (
            <span key={rc.characterId ?? idx} className={CHIP}>
              <button
                type="button"
                onClick={() => { if (rc.characterId != null) onNavigateToCharacter?.(rc.characterId) }}
                className="transition-colors hover:text-ink"
              >
                {rc.name}
              </button>
              <input
                type="text"
                value={rc.relation}
                onChange={(e) => {
                  const next = [...relatedCharacters]
                  next[idx] = { ...next[idx], relation: e.target.value }
                  setRelatedCharacters(next)
                }}
                placeholder="关系"
                className="w-16 bg-transparent text-[12px] text-ink-muted placeholder:text-ink-faint focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setRelatedCharacters(relatedCharacters.filter((_, i) => i !== idx))
                  handleRelatedCharactersChange(relatedCharacterIds.filter((id) => id !== rc.characterId))
                }}
                className="text-ink-faint transition-colors hover:text-error"
                title="移除"
              >
                <X size={11} strokeWidth={2} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {relatedCharacters.length > 0 && presentation === 'table' ? (
        <table className="mt-4 w-full border-collapse">
          <thead>
            <tr>
              <th className={REL_TH}>对象</th>
              <th className={REL_TH}>类型</th>
              <th className={`${REL_TH} text-right`}>关系</th>
            </tr>
          </thead>
          <tbody>
            {relatedCharacters.map((rc, idx) => (
              <tr key={rc.characterId ?? idx} className="border-t border-line">
                <td className="py-2 pr-4 font-serif text-[13px] text-ink">
                  <button
                    type="button"
                    onClick={() => { if (rc.characterId != null) onNavigateToCharacter?.(rc.characterId) }}
                    className="transition-colors hover:text-ink-muted"
                  >
                    {rc.name}
                  </button>
                </td>
                <td className="py-2 pr-4 text-[13px] text-ink-muted">角色</td>
                <td className="py-2">
                  <div className="flex items-center justify-end gap-3">
                    <input
                      type="text"
                      value={rc.relation}
                      onChange={(e) => {
                        const next = [...relatedCharacters]
                        next[idx] = { ...next[idx], relation: e.target.value }
                        setRelatedCharacters(next)
                      }}
                      placeholder="关系"
                      className="w-32 bg-transparent text-right text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setRelatedCharacters(relatedCharacters.filter((_, i) => i !== idx))
                        handleRelatedCharactersChange(relatedCharacterIds.filter((id) => id !== rc.characterId))
                      }}
                      className="text-ink-faint transition-colors hover:text-error"
                      title="移除"
                    >
                      <X size={12} strokeWidth={2} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {inboundRelations.length > 0 ? (
        <div className="mt-4">
          {/* 只读镜像：权威记录在发起方，这里不提供编辑（见 docs/关系图.md §2.1） */}
          <h4 className="mb-2 text-[11px] tracking-[0.08em] text-ink-faint">来自</h4>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={REL_TH}>来源角色</th>
                <th className={`${REL_TH} text-right`}>关系</th>
              </tr>
            </thead>
            <tbody>
              {inboundRelations.map((rel, idx) => (
                <tr key={`${rel.fromId}-${idx}`} className="border-t border-line">
                  <td className="py-2 pr-4 font-serif text-[13px] text-ink">
                    <button
                      type="button"
                      onClick={() => onNavigateToCharacter?.(rel.fromId)}
                      className="transition-colors hover:text-ink-muted"
                    >
                      {rel.fromName}
                    </button>
                  </td>
                  <td className="py-2 text-right text-[13px] text-ink-muted">{rel.relation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
