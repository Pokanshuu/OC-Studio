import { invoke } from '@tauri-apps/api/core'
import { save as saveFileDialog } from '@tauri-apps/plugin-dialog'

import { isNativePlatform, isTauri } from '../env'
import { exportToMarkdown, exportToTxt } from './markdown'

/**
 * 桌面版走「系统保存对话框 + Rust 落盘」。
 *
 * 不能用 `<a download>`：WebView2 里那条路不可靠（下载被宿主接管），
 * 表现就是「点了导出没反应」——旧版本的内置库备份按钮踩过这个坑。
 * 浏览器预览（!isTauri）才走 blob 下载。
 */
async function saveWithDialog(content: string, filename: string, extensions: string[]): Promise<string | null> {
  const path = await saveFileDialog({
    defaultPath: filename,
    filters: [{ name: '导出文件', extensions }],
  })
  if (path === null) return null
  await invoke<number>('save_text', { path, content })
  return path
}

function extensionOf(filename: string): string[] {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? [] : [filename.slice(dot + 1)]
}

export async function downloadJson(data: unknown, filename?: string): Promise<string> {
  const json = JSON.stringify(data, null, 2)
  const date = new Date().toISOString().slice(0, 10)
  const name = filename ?? `oc-backup-${date}.ocbak`

  if (isNativePlatform()) {
    await downloadJsonCapacitor(json, name)
    return name
  }

  if (isTauri()) {
    const saved = await saveWithDialog(json, name, extensionOf(name))
    if (saved === null) throw new Error('已取消')
    return saved
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


export async function downloadText(content: string, filename: string, mimeType: string): Promise<void> {
  if (isNativePlatform()) {
    await downloadTextCapacitor(content, filename)
    return
  }

  if (isTauri()) {
    const saved = await saveWithDialog(content, filename, extensionOf(filename))
    if (saved === null) throw new Error('已取消')
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

