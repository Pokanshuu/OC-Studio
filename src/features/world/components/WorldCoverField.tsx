'use client'

/**
 * 分类条目的封面槽位（3:2）—— 世界编辑器与分类编辑器共用。
 *
 * 封面会出现在分类卡片上，也会进 `.ocbak` / 文件夹落地（`lib/image-refs.ts`）；
 * 这里只负责选图 / 裁剪 / 落盘，写法与角色封面同一套 `ImageUploader`。
 */
import { useState } from 'react'
import { toast } from 'sonner'
import type { WorldEntry } from '@/types'
import { ImageUploader } from '@/components/shared/ImageUploader'
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
    <div className="flex justify-center">
      <ImageUploader
        value={cover}
        onChange={save}
        onRemove={() => save('')}
        aspectRatio="3:2"
        size="lg"
        enableCrop
        placeholderText="上传封面"
      />
    </div>
  )
}
