import { open } from '@tauri-apps/plugin-dialog'
import { readFile, writeFile, mkdir } from '@tauri-apps/plugin-fs'
import { appDataDir } from '@tauri-apps/api/path'
import { convertFileSrc } from '@tauri-apps/api/core'

export class LocalAdapter {
  private appDataDirPath = ''

  async init(): Promise<void> {
    if (!this.appDataDirPath) {
      this.appDataDirPath = await appDataDir()
    }
  }

  private generateFileName(_type: string): string {
    const timestamp = Date.now()
    return `character-avatar-${timestamp}.png`
  }

  async upload(_type: string): Promise<string> {
    await this.init()

    const selected = await open({
      multiple: false,
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    })

    if (!selected) return ''

    const filePath = selected as string
    const fileBytes = await readFile(filePath)
    const imagesDir = `${this.appDataDirPath}/images`
    const fileName = this.generateFileName(_type)
    const destPath = `${imagesDir}/${fileName}`

    try {
      await mkdir(imagesDir, { recursive: true })
    } catch {
      // directory may already exist
    }

    await writeFile(destPath, fileBytes)

    return `images/${fileName}`
  }

  getUrl(path: string): string {
    if (!path) {
      return '/images/defaults/character-avatar.svg'
    }
    if (path.startsWith('asset://') || path.startsWith('http://') || path.startsWith('https://')) {
      return path
    }
    if (this.appDataDirPath) {
      return convertFileSrc(`${this.appDataDirPath}/${path}`)
    }
    return path
  }
}
