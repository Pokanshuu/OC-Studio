import { convertHeifToJpeg } from '../image-heif'

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
          resolve(URL.createObjectURL(converted))
        } else {
          reject(new Error('未选择文件'))
        }
      }
      input.onerror = () => reject(new Error('文件选择失败'))
      input.click()
    })
  }
}
