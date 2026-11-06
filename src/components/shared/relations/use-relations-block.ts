'use client'

/**
 * 关系区块的模板参数（呈现 / 标题）—— 三个编辑器共用。
 *
 * 呈现（表格 / 紧凑 / 图）写在**模板**里，不是这一篇笔记：
 * 切换时调 `setTemplateComponentParam`，所有用同一模板的笔记一起变
 * （`docs/模板.md §6.3` / §8.4）。
 */
import { useCallback } from 'react'
import { toast } from 'sonner'
import type { TemplateDoc } from '@/lib/templates/types'
import { componentParam, templateAcceptsParam } from '@/lib/templates/params'
import { setTemplateComponentParam } from '@/lib/templates/store'
import { normalizeRelationPresentation, type RelationPresentation } from './types'

export function useRelationsBlock(template: TemplateDoc | undefined): {
  presentation: RelationPresentation
  showTitle: boolean
  canSwitch: boolean
  setPresentation: (next: RelationPresentation) => void
} {
  const component = template?.components.find((item) => item.id === 'relations')
  const presentation = normalizeRelationPresentation(componentParam(component, 'presentation', 'table'))
  const showTitle = componentParam(component, 'title', true) !== false
  const canSwitch = template !== undefined && templateAcceptsParam(template.id, 'relations', template)

  const setPresentation = useCallback(
    (next: RelationPresentation) => {
      if (!template) return
      void setTemplateComponentParam(template.id, 'relations', 'presentation', next).catch((error: unknown) => {
        toast.error('模板写入失败', {
          description: error instanceof Error ? error.message : String(error),
        })
      })
    },
    [template],
  )

  return { presentation, showTitle, canSwitch, setPresentation }
}
