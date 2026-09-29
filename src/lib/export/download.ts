import { isNativePlatform } from '../env'
import { exportToMarkdown, exportToTxt } from './markdown'

export async function downloadJson(data: unknown, filename?: string): Promise<string> {
  const json = JSON.stringify(data, null, 2)
  const date = new Date().toISOString().slice(0, 10)
  const name = filename ?? `oc-backup-${date}.ocbak`

  if (isNativePlatform()) {
    await downloadJsonCapacitor(json, name)
    return name
  }

  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return name
}

async function downloadJsonCapacitor(json: string, filename: string): Promise<void> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')

  await Filesystem.writeFile({
    path: filename,
    data: json,
    directory: Directory.Documents,
  })

  const { uri } = await Filesystem.getUri({
    path: filename,
    directory: Directory.Documents,
  })

  // 尝试通过 Web Share API 分享文件
  const blob = new Blob([json], { type: 'application/json' })
  const file = new File([blob], filename, { type: 'application/json' })
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'OC Studio 数据导出' })
  }
  // 无法分享时静默成功，文件已保存到 Documents 目录
  void uri
}

// ── Markdown / TXT 导出 ──


async function downloadText(content: string, filename: string, mimeType: string): Promise<void> {
  if (isNativePlatform()) {
    await downloadTextCapacitor(content, filename)
    return
  }

  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function downloadTextCapacitor(content: string, filename: string): Promise<void> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')

  await Filesystem.writeFile({
    path: filename,
    data: content,
    directory: Directory.Documents,
  })

  const { uri } = await Filesystem.getUri({
    path: filename,
    directory: Directory.Documents,
  })

  const blob = new Blob([content], { type: 'text/plain' })
  const file = new File([blob], filename, { type: 'text/plain' })
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'OC Studio 导出' })
  }
  void uri
}

export async function downloadMarkdown(): Promise<void> {
  const md = await exportToMarkdown()
  const date = new Date().toISOString().slice(0, 10)
  await downloadText(md, `oc-export-${date}.md`, 'text/markdown')
}

export async function downloadTxt(): Promise<void> {
  const txt = await exportToTxt()
  const date = new Date().toISOString().slice(0, 10)
  await downloadText(txt, `oc-export-${date}.txt`, 'text/plain')
}

