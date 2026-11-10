'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { resolveImageUrl, saveBlobToDiskOrToast } from '@/lib/image-service'
import { convertHeifToJpeg } from '@/lib/image-heif'

/**
 * 图片上传流水线：选文件 → （可选）裁剪 → 落盘 → 回传路径。
 *
 * 两种目标共用一个流水线：
 * - 新增：`triggerFileUpload()` → `onAdd(path)`
 * - 更换 / 编辑第 N 张：`triggerFileUpload(index)` / `editExisting(index, src)` → `onReplace(index, path)`
 *
 * 开启裁剪时不等待 HEIF 转换：先拿原始文件开裁剪器，后台转成 JPEG 再替换源图
 * （`converting` 供裁剪器显示加载态）。调用方负责渲染裁剪器。
 */
export function useImageUpload({
  onAdd,
  onReplace,
  enableCrop,
}: {
  onAdd?: (path: string) => void
  onReplace?: (index: number, path: string) => void
  enableCrop: boolean
}) {
  const [rawFileUrl, setRawFileUrl] = useState<string | null>(null)
  const [cropperOpen, setCropperOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [converting, setConverting] = useState(false)
  /** 有值 = 这次流水线要替换哪一张；null = 新增 */
  const targetRef = useRef<number | null>(null)

  function finish(path: string) {
    const index = targetRef.current
    targetRef.current = null
    if (index !== null) onReplace?.(index, path)
    else onAdd?.(path)
  }

  async function triggerFileUpload(replaceIndex?: number) {
    if (replaceIndex === undefined && !onAdd) return
    if (replaceIndex !== undefined && !onReplace) return
    targetRef.current = replaceIndex ?? null

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        targetRef.current = null
        return
      }

      if (enableCrop) {
        if (rawFileUrl) URL.revokeObjectURL(rawFileUrl)
        // 立即打开裁剪器，不等待 HEIF 转换
        const initialUrl = URL.createObjectURL(file)
        setRawFileUrl(initialUrl)
        setCropperOpen(true)
        // 后台异步转换 HEIF → JPEG
        setConverting(true)
        convertHeifToJpeg(file).then((converted) => {
          URL.revokeObjectURL(initialUrl)
          setRawFileUrl(URL.createObjectURL(converted))
          setConverting(false)
        }).catch((err) => {
          console.warn('[ImageGallery] HEIF conversion failed:', err)
          setConverting(false)
        })
      } else {
        setUploading(true)
        try {
          const url = await saveBlobToDiskOrToast(file, 'gallery')
          if (url !== null) finish(url)
        } finally {
          setUploading(false)
        }
      }
    }
    input.click()
  }

  /** 右键菜单的「编辑」：取回已有图，裁剪后替换同一位置 */
  async function editExisting(index: number, src: string) {
    if (!onReplace) return
    targetRef.current = index
    try {
      const response = await fetch(resolveImageUrl(src, 'cover'))
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      if (rawFileUrl) URL.revokeObjectURL(rawFileUrl)
      setRawFileUrl(URL.createObjectURL(blob))
      setCropperOpen(true)
    } catch (err) {
      targetRef.current = null
      toast.error('取不到原图', { description: err instanceof Error ? err.message : String(err) })
    }
  }

  async function handleCropComplete(blob: Blob) {
    setUploading(true)
    try {
      const url = await saveBlobToDiskOrToast(blob, 'portrait')
      if (url === null) return
      finish(url)
      setCropperOpen(false)
      if (rawFileUrl) {
        URL.revokeObjectURL(rawFileUrl)
        setRawFileUrl(null)
      }
    } finally {
      setUploading(false)
    }
  }

  function handleCropperClose() {
    targetRef.current = null
    setCropperOpen(false)
    setConverting(false)
    if (rawFileUrl) {
      URL.revokeObjectURL(rawFileUrl)
      setRawFileUrl(null)
    }
  }

  return {
    triggerFileUpload,
    editExisting,
    uploading,
    rawFileUrl,
    cropperOpen,
    converting,
    handleCropComplete,
    handleCropperClose,
  }
}
