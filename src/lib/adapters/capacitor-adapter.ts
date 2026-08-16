import { Filesystem, Directory } from '@capacitor/filesystem'
import { convertHeifToJpeg } from '../image-heif'

function generateFileName(type: string): string {
  const timestamp = Date.now()
  return `${type}-${timestamp}.png`
}

export class CapacitorAdapter {
  async upload(type: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) {
          reject(new Error('未选择文件'))
          return
        }
        try {
          // HEIF → JPEG 转换，确保写入磁盘的是浏览器可解码的格式
          const converted = await convertHeifToJpeg(file)
          const arrayBuffer = await converted.arrayBuffer()
          const base64 = btoa(
            new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
          )
          const fileName = generateFileName(type)
          await Filesystem.writeFile({
            path: `images/${fileName}`,
            data: base64,
            directory: Directory.Data,
            recursive: true,
          })
          const { uri } = await Filesystem.getUri({
            path: `images/${fileName}`,
            directory: Directory.Data,
          })
          resolve(uri)
        } catch (err) {
          console.error('[CapacitorAdapter.upload] writeFile failed:', err)
          reject(err)
        }
      }
      input.onerror = () => reject(new Error('文件选择失败'))
      input.click()
    })
  }
}
