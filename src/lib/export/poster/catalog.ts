/**
 * 海报版式的**元数据目录**（无 React，可在脚本 / 服务端直接引用）。
 *
 * 组件在 `components/shared/poster/registry.tsx` 里按 id 装配；这里只放
 * 「叫什么、支持哪些封面位置、默认对齐 / 列数」。改版式先改这里，
 * `npm run audit:export` 会校验六套齐全、`auto` 一定在支持集里。
 */
import type { PosterCoverPlacement, PosterTemplateId, PosterTone } from './types'

export interface PosterTemplateInfo {
  id: PosterTemplateId
  name: string
  hint: string
  /** 固定色调；不填则跟随背景 */
  tone?: PosterTone
  coverPlacements: PosterCoverPlacement[]
  defaultAlign: 'left' | 'center' | 'right'
  defaultFieldColumns: 1 | 2
}

export const POSTER_TEMPLATE_INFO: Record<PosterTemplateId, PosterTemplateInfo> = {
  editorial: {
    id: 'editorial',
    name: '刊首',
    hint: '杂志封面',
    coverPlacements: ['auto', 'top', 'left', 'right', 'background', 'hidden'],
    defaultAlign: 'left',
    defaultFieldColumns: 2,
  },
  noir: {
    id: 'noir',
    name: '夜色',
    hint: '电影海报',
    tone: 'ink',
    coverPlacements: ['auto', 'background', 'top', 'hidden'],
    defaultAlign: 'left',
    defaultFieldColumns: 2,
  },
  archive: {
    id: 'archive',
    name: '档案',
    hint: '设定集档案',
    coverPlacements: ['auto', 'top', 'left', 'right', 'hidden'],
    defaultAlign: 'left',
    defaultFieldColumns: 1,
  },
  frame: {
    id: 'frame',
    name: '胶片',
    hint: '电影画幅',
    coverPlacements: ['auto', 'top', 'background', 'hidden'],
    defaultAlign: 'left',
    defaultFieldColumns: 1,
  },
  mono: {
    id: 'mono',
    name: '素白',
    hint: '极简排版',
    coverPlacements: ['auto', 'top', 'left', 'right', 'hidden'],
    defaultAlign: 'left',
    defaultFieldColumns: 1,
  },
  split: {
    id: 'split',
    name: '双栏',
    hint: '非对称网格',
    coverPlacements: ['auto', 'left', 'right', 'top', 'background', 'hidden'],
    defaultAlign: 'left',
    defaultFieldColumns: 2,
  },
}
