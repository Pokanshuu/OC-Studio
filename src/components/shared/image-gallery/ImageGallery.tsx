'use client'

import { useState } from 'react'
import { FullscreenViewer } from '../FullscreenViewer'
import { ImageCropper } from '../ImageCropper'
import { useImageUpload } from './useImageUpload'
import { ImageGallerySlider } from './ImageGallerySlider'
import { ImageGalleryGrid } from './ImageGalleryGrid'

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
  enableCrop = false,
  cropAspect,
  gridAspect = 'square',
  addTile = false,
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

  return (
    <>
      {mode === 'slider' ? (
        <ImageGallerySlider
          images={images}
          onAdd={onAdd}
          onRemove={onRemove}
          onViewImage={setViewerIndex}
          uploading={uploading}
          onUploadClick={triggerFileUpload}
        />
      ) : (
        <ImageGalleryGrid
          images={images}
          gridAspect={gridAspect}
          addTile={addTile}
          onAdd={onAdd}
          onRemove={onRemove}
          onViewImage={setViewerIndex}
          uploading={uploading}
          onUploadClick={triggerFileUpload}
        />
      )}

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
