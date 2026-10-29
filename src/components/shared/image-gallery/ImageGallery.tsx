'use client'

import { useImperativeHandle, useState, type Ref } from 'react'
import { FullscreenViewer } from '../FullscreenViewer'
import { ImageCropper } from '../ImageCropper'
import { useImageUpload } from './useImageUpload'
import { ImageGallerySlider } from './ImageGallerySlider'
import { ImageGalleryGrid } from './ImageGalleryGrid'

/** 外部触发选图的句柄：区块标题右侧的「添加」用它，不再在网格里占一个瓦片 */
export interface ImageGalleryHandle {
  add: () => void
}

interface ImageGalleryProps {
  images: string[]
  mode: 'slider' | 'grid'
  onAdd?: (path: string) => void
  onRemove?: (index: number) => void
  columns?: number
  enableCrop?: boolean
  cropAspect?: number
  /** 网格缩略图比例：square 用于相册，portrait 用于立绘（9:16，与裁剪比例一致） */
  gridAspect?: 'square' | 'portrait'
  /** 把「添加」做成网格里的一个瓦片（比整条虚线按钮更轻） */
  addTile?: boolean
  /** 添加入口由调用方放在区块标题里：网格不再渲染瓦片、底部按钮与空态 */
  externalAdd?: boolean
  ref?: Ref<ImageGalleryHandle>
}

/**
 * 图片画廊：两种展示模式 + 上传/裁剪流水线 + 全屏查看。
 * 分层：`image-gallery/`（`useImageUpload` 上传裁剪 · `ImageGallerySlider` · `ImageGalleryGrid`）。
 */
export function ImageGallery({
  images,
  mode,
  onAdd,
  onRemove,
  columns = 4,
  enableCrop = false,
  cropAspect,
  gridAspect = 'square',
  addTile = false,
  externalAdd = false,
  ref,
}: ImageGalleryProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const {
    triggerFileUpload,
    uploading,
    rawFileUrl,
    cropperOpen,
    converting,
    handleCropComplete,
    handleCropperClose,
  } = useImageUpload({ onAdd, enableCrop })

  useImperativeHandle(ref, () => ({ add: triggerFileUpload }), [triggerFileUpload])

  // 标题里已有「添加」：没有图片时整块不渲染，别留一个空的虚线框
  const showGrid = !(externalAdd && images.length === 0)

  return (
    <>
      {mode === 'slider' ? (
        <ImageGallerySlider
          images={images}
          onAdd={externalAdd ? undefined : onAdd}
          onRemove={onRemove}
          onViewImage={setViewerIndex}
          uploading={uploading}
          onUploadClick={triggerFileUpload}
        />
      ) : showGrid ? (
        <ImageGalleryGrid
          images={images}
          columns={columns}
          gridAspect={gridAspect}
          addTile={externalAdd ? false : addTile}
          onAdd={externalAdd ? undefined : onAdd}
          onRemove={onRemove}
          onViewImage={setViewerIndex}
          uploading={uploading}
          onUploadClick={triggerFileUpload}
        />
      ) : null}

      {viewerIndex !== null ? (
        <FullscreenViewer
          images={images}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}

      {/* 裁剪器提到公共壳：grid + enableCrop（角色「立绘」）以前无处渲染，上传是空操作 */}
      {enableCrop && rawFileUrl ? (
        <ImageCropper
          open={cropperOpen}
          src={rawFileUrl}
          aspect={cropAspect ?? 9 / 16}
          shape="rect"
          loading={converting}
          onComplete={handleCropComplete}
          onClose={handleCropperClose}
        />
      ) : null}
    </>
  )
}
