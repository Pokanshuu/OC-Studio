import { open } from '@tauri-apps/plugin-dialog'
import { readFile, writeFile, mkdir } from '@tauri-apps/plugin-fs'
import { appDataDir } from '@tauri-apps/api/path'

export class LocalAdapter {
  private appDataDirPath = ''

  async init(): Promise<void> {
    if (!this.appDataDirPath) {
      this.appDataDirPath = await appDataDir()
    }
  }

  private generateFileName(type: string): string {
    const timestamp = Date.now()
    return `${type}-${timestamp}.png`
  }

  async upload(_type: string): Promise<string> {
    await this.init()

    const selected = await open({
      multiple: false,
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif'] }],
    })

    if (!selected) return ''

    const filePath = selected as string

    let fileBytes: Uint8Array
    try {
      fileBytes = await readFile(filePath)
    } catch (readErr) {
      console.error('[LocalAdapter.upload] readFile failed:', readErr)
      throw readErr
    }

    const imagesDir = `${this.appDataDirPath}/images`
    const fileName = this.generateFileName(_type)
    const destPath = `${imagesDir}/${fileName}`

    try {
      await mkdir(imagesDir, { recursive: true })
    } catch {
      // directory may already exist
    }

    try {
      await writeFile(destPath, fileBytes)
    } catch (writeErr) {
      console.error('[LocalAdapter.upload] writeFile failed:', writeErr)
      throw writeErr
    }

    return `images/${fileName}`
  }
}
