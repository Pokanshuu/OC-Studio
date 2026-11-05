'use client'

/**
 * 笔记宿主的组件块 —— 把「模板里的组件 id」落到 `worldEntries` 的那一列。
 *
 * 与实体编辑器（角色 / 事件 / 国家）共用 `components/shared/template-blocks` 的呈现，
 * 这里只多一件事：**自己读写词条行**。所以世界观编辑器与分类条目编辑器可以共用同一套
 * 区块，不必各自再写一遍状态与保存管线。
 *
 * 标量字段（简介 / 时间 / 地点）防抖 700ms 写库，卸载时补一次；
 * 图片类（头像 / 图片 / 图集）立即写 —— 选完图就该在盘上，不该等防抖。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { GalleryImage, WorldEntry } from '@/types'
import type { TemplateComponent, TemplateDoc } from '@/lib/templates/types'
import { componentParam } from '@/lib/templates/params'
import { assembleTime, parseTime, type ParsedTime } from '@/lib/time-field'
import { RelationsSection } from '@/components/shared/relations/RelationsSection'
import { useRelationsBlock } from '@/components/shared/relations/use-relations-block'
import type { RelationRow } from '@/components/shared/relations/types'
import { AvatarBlock, GalleryBlock, ImageBlock, PlaceBlock, SummaryBlock, TimeBlock } from '@/components/shared/template-blocks'
import { updateEntry } from '../../services'
import type { WorldFormData } from '../../types'
import { useNoteLinks } from '../../hooks/useNoteLinks'

function reportSaveError(err: unknown): void {
  toast.error('保存失败', { description: err instanceof Error ? err.message : String(err) })
}

/** 防抖写库：同一批字段合并成一次 update；卸载 / 切条目时补最后一笔 */
function useNotePatch(entryId: number): (patch: Partial<WorldFormData>) => void {
  const pending = useRef<Partial<WorldFormData>>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const patch = pending.current
    pending.current = {}
    if (Object.keys(patch).length === 0) return
    void updateEntry(entryId, patch).catch(reportSaveError)
  }, [entryId])

  const schedule = useCallback(
    (patch: Partial<WorldFormData>) => {
      pending.current = { ...pending.current, ...patch }
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(flush, 700)
    },
    [flush],
  )

  useEffect(() => flush, [flush])

  return schedule
}

/** 立即写库（图片类） */
function useNoteWrite(entryId: number): (patch: Partial<WorldFormData>) => void {
  return useCallback(
    (patch: Partial<WorldFormData>) => {
      void updateEntry(entryId, patch).catch(reportSaveError)
    },
    [entryId],
  )
}

export function NoteAvatarBlock({ entry }: { entry: WorldEntry }) {
  const [value, setValue] = useState(entry.avatar ?? '')
  const write = useNoteWrite(entry.id)
  const save = (next: string): void => {
    setValue(next)
    write({ avatar: next })
  }
  return <AvatarBlock value={value} onChange={save} onRemove={() => save('')} />
}

export function NoteSummaryBlock({
  entry,
  component,
}: {
  entry: WorldEntry
  component: TemplateComponent
}) {
  const [value, setValue] = useState(entry.summary ?? '')
  const schedule = useNotePatch(entry.id)
  const showTitle = componentParam(component, 'title', true) !== false
  return (
    <SummaryBlock
      value={value}
      showTitle={showTitle}
      onChange={(next) => {
        setValue(next)
        schedule({ summary: next })
      }}
    />
  )
}

export function NoteTimeBlock({
  entry,
  component,
}: {
  entry: WorldEntry
  component: TemplateComponent
}) {
  const [start, setStart] = useState<ParsedTime>(() => parseTime(entry.time ?? ''))
  const [end, setEnd] = useState<ParsedTime>(() => parseTime(entry.endTime ?? ''))
  const schedule = useNotePatch(entry.id)
  const showTitle = componentParam(component, 'title', true) !== false
  const interval = componentParam(component, 'interval', true) !== false

  return (
    <TimeBlock
      start={start}
      end={end}
      interval={interval}
      showTitle={showTitle}
      onChange={(which, part, value) => {
        if (which === 'start') {
          const next = { ...start, [part]: value }
          setStart(next)
          schedule({ time: assembleTime(next.year, next.month, next.day) })
          return
        }
        const next = { ...end, [part]: value }
        setEnd(next)
        schedule({ endTime: assembleTime(next.year, next.month, next.day) })
      }}
    />
  )
}

export function NotePlaceBlock({
  entry,
  component,
}: {
  entry: WorldEntry
  component: TemplateComponent
}) {
  const [value, setValue] = useState(entry.location ?? '')
  const schedule = useNotePatch(entry.id)
  const showTitle = componentParam(component, 'title', true) !== false
  return (
    <PlaceBlock
      value={value}
      showTitle={showTitle}
      onChange={(next) => {
        setValue(next)
        schedule({ location: next })
      }}
    />
  )
}

export function NoteImageBlock({
  entry,
  component,
}: {
  entry: WorldEntry
  component: TemplateComponent
}) {
  const [value, setValue] = useState(entry.image ?? '')
  const write = useNoteWrite(entry.id)
  const showTitle = componentParam(component, 'title', true) !== false
  const width = componentParam(component, 'width', 'full') === 'half' ? 'half' : 'full'
  const save = (next: string): void => {
    setValue(next)
    write({ image: next })
  }
  return (
    <ImageBlock
      value={value}
      onChange={save}
      onRemove={() => save('')}
      showTitle={showTitle}
      width={width}
    />
  )
}

export function NoteGalleryBlock({
  entry,
  component,
}: {
  entry: WorldEntry
  component: TemplateComponent
}) {
  const [images, setImages] = useState<GalleryImage[]>(entry.gallery ?? [])
  const write = useNoteWrite(entry.id)
  const showTitle = componentParam(component, 'title', true) !== false
  const mode = componentParam(component, 'mode', 'grid') === 'slider' ? 'slider' : 'grid'
  const columns = Math.min(6, Math.max(1, Number(componentParam(component, 'columns', 4)) || 4))

  const save = (next: GalleryImage[]): void => {
    setImages(next)
    write({ gallery: next })
  }

  return (
    <GalleryBlock
      images={images.map((image) => image.url)}
      showTitle={showTitle}
      title="画廊"
      mode={mode}
      columns={columns}
      onAdd={(url) => save([...images, { url, caption: '' }])}
      onReplace={(index, url) =>
        save(images.map((image, at) => (at === index ? { ...image, url } : image)))
      }
      onRemove={(index) => save(images.filter((_, at) => at !== index))}
    />
  )
}

/**
 * 关系（笔记宿主）：父词条 / 子条目 / 被引用 —— 全都是查询，不是存储。
 *
 * 行只读、关系名固定；「添加」面板不渲染（笔记没有可手写的边）。
 */
export function NoteRelationsBlock({
  entry,
  template,
  onNavigate,
  linkRows,
}: {
  entry: WorldEntry
  template: TemplateDoc
  onNavigate: (id: number) => void
  /** 已加载的词条列表：世界编辑器直接给，省一次全库扫描 */
  linkRows?: WorldEntry[]
}) {
  const links = useNoteLinks(entry.id, linkRows)
  const block = useRelationsBlock(template)

  const rows: RelationRow[] = [
    ...(links.parent
      ? [
          {
            key: `parent-${links.parent.id}`,
            kind: 'world' as const,
            targetId: links.parent.id,
            name: links.parent.title,
            relation: '父词条',
            relationEditable: false,
            readonly: true,
          },
        ]
      : []),
    ...links.children.map((child) => ({
      key: `child-${child.id}`,
      kind: 'world' as const,
      targetId: child.id,
      name: child.title,
      relation: '子条目',
      relationEditable: false,
      readonly: true,
    })),
  ]

  const inbound: RelationRow[] = links.backlinks.map((link) => ({
    key: `backlink-${link.id}`,
    kind: 'world',
    targetId: link.id,
    name: link.title,
    relation: '引用',
    relationEditable: false,
    readonly: true,
  }))

  return (
    <RelationsSection
      rows={rows}
      inbound={inbound}
      candidates={[]}
      presentation={block.presentation}
      showTitle={block.showTitle}
      onPresentationChange={block.canSwitch ? block.setPresentation : undefined}
      onNavigate={(_kind, id) => onNavigate(id)}
      selfName={entry.title}
    />
  )
}
