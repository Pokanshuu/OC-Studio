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
import type { GalleryImage, WorldEntry, WorldRelation } from '@/types'
import type { RelationArrow } from '@/lib/relation-colors'
import type { TemplateComponent, TemplateDoc } from '@/lib/templates/types'
import { componentParam } from '@/lib/templates/params'
import { isCodexEntry } from '@/lib/entry-kinds'
import { assembleTime, parseTime, type ParsedTime } from '@/lib/time-field'
import { RelationsSection } from '@/components/shared/relations/RelationsSection'
import { useRelationsBlock } from '@/components/shared/relations/use-relations-block'
import type {
  RelationCandidate,
  RelationRow,
  RelationTargetKind,
} from '@/components/shared/relations/types'
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
 * 关系（笔记宿主）：层级 + 命名边 + 正文提及。
 *
 * - 层级（父 / 子）与正文提及是查询，只读
 * - 命名边存在 `WorldEntry.relations` 里，和角色 / 事件同一套边模型；
 *   添加直接落一条边，不再要求用户先回正文写 `[[`
 *
 * 同一个目标如果是命名边，正文那一行就不再重复显示「引用」。
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
  const links = useNoteLinks(entry.id, linkRows, entry.updatedAt)
  const block = useRelationsBlock(template)
  const [relations, setRelations] = useState<WorldRelation[]>(entry.relations ?? [])

  /** 已落盘的那份值：外部变化（撤销 / 另一处保存）时用来判断要不要回灌 */
  const savedRef = useRef(JSON.stringify(entry.relations ?? []))
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<WorldRelation[] | null>(null)

  const write = useCallback(
    (next: WorldRelation[]) => {
      void updateEntry(entry.id, { relations: next })
        .then(() => {
          savedRef.current = JSON.stringify(next)
        })
        .catch((err: unknown) => {
          toast.error('关系保存失败', {
            description: err instanceof Error ? err.message : String(err),
          })
        })
    },
    [entry.id],
  )

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const pending = pendingRef.current
    pendingRef.current = null
    if (pending !== null) write(pending)
  }, [write])

  // 卸载 / 切条目时把还没落盘的改名补上
  useEffect(() => flush, [flush])

  /**
   * 外部值变化才回灌。自己刚写出去的那份（`savedRef`）不回灌，
   * 否则改名防抖还没落盘时，父级的任何一次刷新都会把输入顶掉。
   */
  const externalSignature = JSON.stringify(entry.relations ?? [])
  useEffect(() => {
    if (externalSignature === savedRef.current) return
    if (timerRef.current !== null || pendingRef.current !== null) return
    savedRef.current = externalSignature
    setRelations(entry.relations ?? [])
  }, [externalSignature, entry.relations])

  const persist = useCallback(
    (next: WorldRelation[], immediate: boolean) => {
      setRelations(next)
      pendingRef.current = next
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (immediate) {
        pendingRef.current = null
        write(next)
        return
      }
      // 关系名是逐字输入的：等 500ms 再落库，避免每个字一条写操作
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        const pending = pendingRef.current
        pendingRef.current = null
        if (pending !== null) write(pending)
      }, 500)
    },
    [write],
  )

  const resolveTarget = (relation: WorldRelation): { targetId?: number; name: string } => {
    const target =
      relation.targetId === undefined
        ? undefined
        : links.all.find((row) => row.id === relation.targetId)
    return { targetId: target?.id, name: target?.title ?? relation.name }
  }

  const manualRows: RelationRow[] = relations.map((relation, index) => {
    const target = resolveTarget(relation)
    return {
      key: `manual-${relation.targetId ?? relation.name}-${index}`,
      kind: 'world',
      targetId: target.targetId,
      name: target.name,
      relation: relation.relation,
      relationEditable: true,
      directional: true,
      defaultArrow: 'none',
      arrow: relation.arrow,
      color: relation.color,
      index,
    }
  })

  const factRows: RelationRow[] = [
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
    ...links.outbound.map((link) => ({
      key: `ref-${link.id}`,
      kind: 'world' as const,
      targetId: link.id,
      name: link.title,
      relation: '引用',
      relationEditable: false,
      readonly: true,
    })),
  ]

  const inbound: RelationRow[] = [
    ...links.manualInbound.map((link) => ({
      key: `in-manual-${link.id}-${link.index}`,
      kind: 'world' as const,
      targetId: link.id,
      name: link.name,
      relation: link.relation,
      relationEditable: false,
      directional: true,
      defaultArrow: 'none' as const,
      arrow: link.arrow,
      color: link.color,
      readonly: true,
    })),
    ...links.backlinks.map((link) => ({
      key: `in-ref-${link.id}`,
      kind: 'world' as const,
      targetId: link.id,
      name: link.title,
      relation: '引用',
      relationEditable: false,
      readonly: true,
    })),
  ]

  const candidates: RelationCandidate[] = links.all
    .filter(
      (row) =>
        row.id !== entry.id &&
        isCodexEntry(row) &&
        !relations.some((relation) => relation.targetId === row.id),
    )
    .map((row) => ({
      kind: 'world' as const,
      targetId: row.id,
      name: row.title,
      subtitle: row.category || undefined,
    }))

  const addRelation = (kind: RelationTargetKind, targetId: number): void => {
    if (kind !== 'world') return
    const target = links.all.find((row) => row.id === targetId)
    if (!target) return
    persist(
      [...relations, { targetId, name: target.title, relation: '' }],
      true,
    )
  }

  const removeRelation = (row: RelationRow): void => {
    if (row.index === undefined) return
    persist(
      relations.filter((_, index) => index !== row.index),
      true,
    )
  }

  const renameRelation = (row: RelationRow, value: string): void => {
    if (row.index === undefined) return
    persist(
      relations.map((relation, index) =>
        index === row.index ? { ...relation, relation: value } : relation,
      ),
      false,
    )
  }

  const setRelationArrow = (row: RelationRow, arrow: RelationArrow): void => {
    if (row.index === undefined) return
    persist(
      relations.map((relation, index) =>
        index === row.index ? { ...relation, arrow } : relation,
      ),
      true,
    )
  }

  return (
    <RelationsSection
      rows={[...manualRows, ...factRows]}
      inbound={inbound}
      candidates={candidates}
      presentation={block.presentation}
      showTitle={block.showTitle}
      onPresentationChange={block.canSwitch ? block.setPresentation : undefined}
      onAdd={addRelation}
      onRemove={removeRelation}
      onRename={renameRelation}
      onArrowChange={setRelationArrow}
      onNavigate={(_kind, id) => onNavigate(id)}
      selfName={entry.title}
    />
  )
}
