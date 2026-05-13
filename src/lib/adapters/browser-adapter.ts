export class BrowserAdapter {
  async upload(_type: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = () => {
        const file = input.files?.[0]
        if (file) {
          resolve(URL.createObjectURL(file))
        } else {
          reject(new Error('未选择文件'))
        }
      }
      input.onerror = () => reject(new Error('文件选择失败'))
      input.click()
    })
  }
}
