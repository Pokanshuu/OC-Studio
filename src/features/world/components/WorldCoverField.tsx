'use client'

/**
 * 分类条目 / 词条的封面槽位（3:2）—— 世界编辑器与分类编辑器共用。
 *
 * **与角色 / 事件 / 国家封面是同一个组件**（`ProfileBannerEditor` 的头图：
 * `StretchyHeader` 撑满内容宽度、3:2、下拉放大 / 滚动折叠 / 单击看大图 / 右键菜单）。
 * 这里只负责把封面写回 `WorldEntry.cover`；不再自己摆一个固定宽度的缩略图槽，
 * 否则同一份模板里的 `cover` 会在角色页和分类页长成两种东西。
 */
import { useState } from 'react'
import { toast } from 'sonner'
import type { WorldEntry } from '@/types'
import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import { updateEntry } from '@/features/world/services'

export function WorldCoverField({ entry }: { entry: WorldEntry }) {
  const [cover, setCover] = useState(entry.cover ?? '')

  const save = (path: string): void => {
    setCover(path)
    void updateEntry(entry.id, { cover: path }).catch((err: unknown) => {
      toast.error('封面保存失败', { description: err instanceof Error ? err.message : String(err) })
    })
  }

  return (
    <ProfileBannerEditor
      headerUrl={cover}
      onHeaderChange={save}
      onHeaderRemove={() => save('')}
    />
  )
}
