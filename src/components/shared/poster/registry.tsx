'use client'

/**
 * 海报版式登记 —— **组件与 id 的唯一装配点**。
 *
 * 元数据在 `lib/export/poster/catalog.ts`（无 React，脚本可直接读），
 * 这里只把 id 映射到组件。导出中心只读 `POSTER_TEMPLATES`，不自己写 if。
 */
import type { PosterTemplateId, PosterTemplateMeta } from '@/lib/export/poster/types'
import { POSTER_TEMPLATE_INFO } from '@/lib/export/poster/catalog'
import EditorialPoster from './templates/editorial'
import NoirPoster from './templates/noir'
import ArchivePoster from './templates/archive'
import FramePoster from './templates/frame'
import MonoPoster from './templates/mono'
import SplitPoster from './templates/split'

const COMPONENTS: Record<PosterTemplateId, PosterTemplateMeta['component']> = {
  editorial: EditorialPoster,
  noir: NoirPoster,
  archive: ArchivePoster,
  frame: FramePoster,
  mono: MonoPoster,
  split: SplitPoster,
}

export const POSTER_TEMPLATES: readonly PosterTemplateMeta[] = (
  Object.keys(POSTER_TEMPLATE_INFO) as PosterTemplateId[]
).map((id) => ({ ...POSTER_TEMPLATE_INFO[id], component: COMPONENTS[id] }))

export const POSTER_TEMPLATE_BY_ID: Record<PosterTemplateId, PosterTemplateMeta> = Object.fromEntries(
  POSTER_TEMPLATES.map((item) => [item.id, item]),
) as Record<PosterTemplateId, PosterTemplateMeta>

export function posterTemplateOf(id: PosterTemplateId): PosterTemplateMeta {
  return POSTER_TEMPLATE_BY_ID[id] ?? POSTER_TEMPLATES[0]
}
