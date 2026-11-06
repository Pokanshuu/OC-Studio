'use client'

/**
 * 画廊组件 —— 角色「相册」、事件「图片」、词条「画廊」共用（`docs/模板.md §6.6`）。
 *
 * 标题（可关）+「＋ 添加」+ 网格 / 滑动两种排法。图片本身的交互全部在
 * `ImageGallery` 里（单击看大图、右键 / 长按菜单、裁剪），这里不复制那套逻辑；
 * 参数 `mode` / `columns` / `title` 由模板给，缺省值按调用方传的回落。
 */
import { useRef } from 'react'
import { Plus } from 'lucide-react'
import { ADD_ACTION } from '@/lib/ui-tokens'
import { ImageGallery, type ImageGalleryHandle } from '../image-gallery/ImageGallery'
import { ComponentSection } from '../ComponentSection'

interface GalleryBlockProps {
  images: string[]
  onAdd: (path: string) => void
  onReplace?: (index: number, path: string) => void
  onRemove?: (index: number) => void
  showTitle?: boolean
  /** 标题文字（角色可叫「相册」、事件叫「图片」） */
  title?: string
  mode?: 'grid' | 'slider'
  columns?: number
  gridAspect?: 'square' | 'portrait' | 'wide'
  enableCrop?: boolean
  cropAspect?: number
}

export function GalleryBlock({
  images,
  onAdd,
  onReplace,
  onRemove,
  showTitle = true,
  title = '画廊',
  mode = 'grid',
  columns = 4,
  gridAspect = 'square',
  enableCrop = false,
  cropAspect,
}: GalleryBlockProps) {
  const gallery = useRef<ImageGalleryHandle>(null)

  return (
    <ComponentSection
      divider={false}
      title={showTitle ? title : undefined}
      action={
        <button
          type="button"
          onClick={() => gallery.current?.add()}
          className={ADD_ACTION}
        >
          <Plus size={12} strokeWidth={2} />
          <span>添加</span>
        </button>
      }
    >
      <ImageGallery
        ref={gallery}
        mode={mode}
        columns={columns}
        gridAspect={gridAspect}
        externalAdd
        images={images}
        enableCrop={enableCrop}
        cropAspect={cropAspect}
        onAdd={onAdd}
        onReplace={onReplace}
        onRemove={onRemove}
      />
    </ComponentSection>
  )
}
