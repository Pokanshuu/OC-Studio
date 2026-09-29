'use client'

import { useState } from 'react'
import { saveBlobToDisk } from '@/lib/image-service'
import { convertHeifToJpeg } from '@/lib/image-heif'

/**
 * 图片上传流水线：选文件 → （可选）裁剪 → 落盘 → 回传路径。
 *
 * 开启裁剪时不等待 HEIF 转换：先拿原始文件开裁剪器，后台转成 JPEG 再替换源图
 * （`converting` 供裁剪器显示加载态）。
 * 调用方负责渲染裁剪器：`enableCrop && rawFileUrl` 时挂 `<ImageCropper ... />`。
 */
export function useImageUpload({
  onAdd,
  enableCrop,
}: {
  onAdd?: (path: string) => void
  enableCrop: boolean
}) {
  const [rawFileUrl, setRawFileUrl] = useState<string | null>(null)
  const [cropperOpen, setCropperOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [converting, setConverting] = useState(false)

  async function triggerFileUpload() {
    if (!onAdd) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return

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
          const url = await saveBlobToDisk(file, 'gallery')
          onAdd(url)
        } finally {
          setUploading(false)
        }
      }
    }
    input.click()
  }

  async function handleCropComplete(blob: Blob) {
    setUploading(true)
    try {
      const url = await saveBlobToDisk(blob, 'portrait')
      onAdd?.(url)
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
    setCropperOpen(false)
    setConverting(false)
    if (rawFileUrl) {
      URL.revokeObjectURL(rawFileUrl)
      setRawFileUrl(null)
    }
  }

  return {
    triggerFileUpload,
    uploading,
    rawFileUrl,
    cropperOpen,
    converting,
    handleCropComplete,
    handleCropperClose,
  }
}
