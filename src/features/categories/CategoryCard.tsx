'use client'

/**
 * 分类条目的卡片态 —— **直接复用实体列表的 `CoverCard`**：
 * 封面照片 → 下缘渐进模糊 → 色块，衬线标题 + 简介 + 副信息 + 头像 / 首字水印。
 *
 * 与角色 / 事件 / 国家的卡片是同一张卡，只是数据来自 `WorldEntry`：
 * - 封面槽位用 `entry.cover`（3:2），无封面时 `CoverCard` 本来就会画首字水印；
 * - 头像槽位用 `entry.avatar`（有才显示）；
 * - 动作固定为「移到文件夹 / 删除」，压在右上角（桌面悬停才出现）。
 */
import type { WorldEntry } from '@/types'
import { resolveImageUrl } from '@/lib/image-service'
import { Avatar } from '@/components/shared/Avatar'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { CoverCard } from '@/components/shared/cover/CoverCard'
import { MoveToFolderMenu } from '@/features/characters/components/MoveToFolderMenu'

interface CategoryCardProps {
  entry: WorldEntry
  excerpt: string
  sortable: boolean
  isMobile: boolean
  onOpen: (id: number) => void
  onDelete: (entry: WorldEntry) => void
  onLongPress?: () => void
  folders?: string[]
  onMoveToFolder?: (folder: string | null) => void
}

export function CategoryCard({
  entry,
  excerpt,
  sortable,
  isMobile,
  onOpen,
  onDelete,
  onLongPress,
  folders = [],
  onMoveToFolder,
}: CategoryCardProps) {
  const cover = entry.cover ? resolveImageUrl(entry.cover, 'cover') : undefined
  const avatar = entry.avatar ? resolveImageUrl(entry.avatar, 'avatar') : undefined
  const folder = (entry.folder ?? '').trim()

  return (
    <CoverCard
      id={entry.id}
      title={entry.title || '未命名'}
      intro={excerpt || undefined}
      meta={folder || undefined}
      imageSrc={cover}
      tintSrc={cover ?? avatar}
      emblem={entry.avatar ? <Avatar src={entry.avatar} fill /> : undefined}
      actions={
        !isMobile ? (
          <>
            <MoveToFolderMenu
              folders={folders}
              current={entry.folder}
              onMove={(next) => onMoveToFolder?.(next)}
              tone="overlay"
            />
            <DeleteButton tone="overlay" onDelete={() => onDelete(entry)} />
          </>
        ) : undefined
      }
      onSelect={() => onOpen(entry.id)}
      onLongPress={onLongPress}
      isMobile={isMobile}
      sortable={sortable}
    />
  )
}
