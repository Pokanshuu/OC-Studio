'use client'

import { useImperativeHandle, useState, type Ref } from 'react'
import { useMediaDownload } from '@/lib/use-media-download'
import { FullscreenViewer } from '../FullscreenViewer'
import { ImageCropper } from '../ImageCropper'
import { MediaContextMenu, type MediaMenuItem } from '../MediaContextMenu'
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
  /** 更换 / 编辑后写回同一位置 */
  onReplace?: (index: number, path: string) => void
  columns?: number
  enableCrop?: boolean
  cropAspect?: number
  /** 网格缩略图比例：square 用于相册，portrait 用于立绘（9:16），wide 用于单张「图片」槽（3:2） */
  gridAspect?: 'square' | 'portrait' | 'wide'
  /** 把「添加」做成网格里的一个瓦片（比整条虚线按钮更轻） */
  addTile?: boolean
  /** 添加入口由调用方放在区块标题里：网格不再渲染瓦片、底部按钮与空态 */
  externalAdd?: boolean
  ref?: Ref<ImageGalleryHandle>
}

/**
 * 图片画廊：两种展示模式 + 上传/裁剪流水线 + 全屏查看。
 *
 * 交互与全站图片一致：**单击看大图，右键 / 长按出菜单**（查看大图 / 更换 / 编辑 /
 * 保存到… / 移除）。网格与滑动条共用同一份菜单项，不在图上再压删除 / 添加快捷钮。
 */
export function ImageGallery({
  images,
  mode,
  onAdd,
  onRemove,
  onReplace,
  columns = 4,
  enableCrop = false,
  cropAspect,
  gridAspect = 'square',
  addTile = false,
  externalAdd = false,
  ref,
}: ImageGalleryProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [menuAt, setMenuAt] = useState<{ x: number; y: number; index: number } | null>(null)
  const { save } = useMediaDownload()
  const {
    triggerFileUpload,
    editExisting,
    uploading,
    rawFileUrl,
    cropperOpen,
    converting,
    handleCropComplete,
    handleCropperClose,
  } = useImageUpload({ onAdd, onReplace, enableCrop })

  /** 新增入口：不能把 triggerFileUpload 直接交给 onClick —— 事件对象会被当成 replaceIndex */
  const uploadNew = () => {
    void triggerFileUpload()
  }

  useImperativeHandle(ref, () => ({ add: () => { void triggerFileUpload() } }), [triggerFileUpload])

  // 标题里已有「添加」：没有图片时整块不渲染，别留一个空的虚线框
  const showGrid = !(externalAdd && images.length === 0)

  const menuItems = (index: number): MediaMenuItem[] => {
    const url = images[index]
    const items: MediaMenuItem[] = [{ label: '查看大图', onSelect: () => setViewerIndex(index) }]
    if (onReplace) items.push({ label: '更换', onSelect: () => triggerFileUpload(index) })
    if (onReplace && enableCrop) {
      items.push({ label: '编辑', onSelect: () => void editExisting(index, url) })
    }
    items.push({
      label: '保存到…',
      onSelect: () => {
        void save(url, '图片.png')
      },
    })
    if (onRemove) items.push({ label: '移除', danger: true, onSelect: () => onRemove(index) })
    return items
  }

  const openMenu = (index: number, at: { x: number; y: number }) =>
    setMenuAt({ x: at.x, y: at.y, index })

  return (
    <>
      {mode === 'slider' ? (
        <ImageGallerySlider
          images={images}
          onViewImage={setViewerIndex}
          onOpenMenu={openMenu}
          uploading={uploading}
          onUploadClick={uploadNew}
        />
      ) : showGrid ? (
        <ImageGalleryGrid
          images={images}
          columns={columns}
          gridAspect={gridAspect}
          addTile={externalAdd ? false : addTile}
          onAdd={externalAdd ? undefined : onAdd}
          onViewImage={setViewerIndex}
          onOpenMenu={openMenu}
          uploading={uploading}
          onUploadClick={uploadNew}
        />
      ) : null}

      {viewerIndex !== null ? (
        <FullscreenViewer
          images={images}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}

      {menuAt ? (
        <MediaContextMenu
          at={{ x: menuAt.x, y: menuAt.y }}
          items={menuItems(menuAt.index)}
          onClose={() => setMenuAt(null)}
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
