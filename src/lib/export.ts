import { db } from '@/lib/db'

interface ExportPayload {
  version: 1
  exportedAt: string
  data: {
    characters: unknown[]
    events: unknown[]
    countries: unknown[]
    worldEntries: unknown[]
    tags: unknown[]
  }
}

export async function exportAllData(): Promise<ExportPayload> {
  const [characters, events, countries, worldEntries, tags] = await Promise.all([
    db.characters.filter((c) => !c.deleted).toArray(),
    db.events.filter((e) => !e.deleted).toArray(),
    db.countries.filter((c) => !c.deleted).toArray(),
    db.worldEntries.filter((w) => !w.deleted).toArray(),
    db.tags.toArray(),
  ])

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      characters,
      events,
      countries,
      worldEntries,
      tags,
    },
  }
}

function isCapacitor(): boolean {
  return typeof window !== 'undefined' && !!window.Capacitor && !window.__TAURI_INTERNALS__
}

export function downloadJson(data: unknown, filename?: string): void {
  const json = JSON.stringify(data, null, 2)
  const date = new Date().toISOString().slice(0, 10)
  const name = filename ?? `oc-backup-${date}.ocbak`

  if (isCapacitor()) {
    downloadJsonCapacitor(json, name)
    return
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
