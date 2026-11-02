import { convertHeifToJpeg } from '../image-heif'

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(blob)
  })
}

export class BrowserAdapter {
  async upload(_type: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (file) {
          // HEIF → JPEG 转换，确保浏览器可解码
          const converted = await convertHeifToJpeg(file)
          resolve(await blobToDataUrl(converted))
        } else {
          reject(new Error('未选择文件'))
        }
      }
      input.onerror = () => reject(new Error('文件选择失败'))
      input.click()
    })
  }
}
