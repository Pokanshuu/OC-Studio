'use client'

/**
 * 图片组件（`docs/模板.md §6.5`）：**单张**，与画廊是同一个「图片数组」能力的两个槽位 ——
 * 区别只在数量与默认呈现（图片单张、3:2 框；画廊多张、网格 / 滑动）。
 *
 * 宽度参数 `full` / `half` 走模板（`image.width`），渲染器按同一个值缩列宽。
 * 图片的交互仍然复用 `ImageGallery`：单击看大图、右键 / 长按菜单、更换 / 移除。
 */
import { useRef } from 'react'
import { Plus } from 'lucide-react'
import { ADD_ACTION } from '@/lib/ui-tokens'
import { ImageGallery, type ImageGalleryHandle } from '../image-gallery/ImageGallery'
import { ComponentSection } from '../ComponentSection'

interface ImageBlockProps {
  value: string
  onChange: (path: string) => void
  onRemove: () => void
  showTitle?: boolean
  title?: string
  width?: 'full' | 'half'
}

export function ImageBlock({
  value,
  onChange,
  onRemove,
  showTitle = true,
  title = '图片',
  width = 'full',
}: ImageBlockProps) {
  const gallery = useRef<ImageGalleryHandle>(null)
  const images = value ? [value] : []

  return (
    <ComponentSection
      title={showTitle ? title : undefined}
      action={
        <button type="button" onClick={() => gallery.current?.add()} className={ADD_ACTION}>
          <Plus size={12} strokeWidth={2} />
          <span>{value ? '更换' : '添加'}</span>
        </button>
      }
    >
      <div className={width === 'half' ? 'w-full sm:w-1/2' : 'w-full'}>
        <ImageGallery
          ref={gallery}
          mode="grid"
          columns={1}
          gridAspect="wide"
          externalAdd
          images={images}
          onAdd={onChange}
          onReplace={(_, path) => onChange(path)}
          onRemove={onRemove}
        />
      </div>
    </ComponentSection>
  )
}
