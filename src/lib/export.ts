import { db } from '@/lib/db'
import { createZip, downloadBlob } from '@/lib/zip'

export interface ExportPayload {
  version: 2
  exportedAt: string
  meta: {
    app: 'OC Studio'
    format: 'oc-studio-backup'
    offline: true
    includes: string[]
  }
  data: {
    characters: unknown[]
    events: unknown[]
    countries: unknown[]
    worldEntries: unknown[]
    tags: unknown[]
    maps: unknown[]
  }
}

export async function exportAllData(): Promise<ExportPayload> {
  const [characters, events, countries, worldEntries, tags, maps] = await Promise.all([
    db.characters.filter((c) => !c.deleted).toArray(),
    db.events.filter((e) => !e.deleted).toArray(),
    db.countries.filter((c) => !c.deleted).toArray(),
    db.worldEntries.filter((w) => !w.deleted).toArray(),
    db.tags.toArray(),
    db.maps.filter((m) => !m.deleted).toArray(),
  ])

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    meta: {
      app: 'OC Studio',
      format: 'oc-studio-backup',
      offline: true,
      includes: ['characters', 'events', 'countries', 'worldEntries', 'tags', 'maps'],
    },
    data: {
      characters,
      events,
      countries,
      worldEntries,
      tags,
      maps,
    },
  }
}

export async function exportAllDataZip(): Promise<{ name: string; size: number }> {
  const data = await exportAllData()
  const date = new Date().toISOString().slice(0, 10)
  const manifest = {
    format: 'oc-studio-backup',
    version: 2,
    createdAt: data.exportedAt,
    offline: true,
    counts: {
      characters: data.data.characters.length,
      events: data.data.events.length,
      countries: data.data.countries.length,
      worldEntries: data.data.worldEntries.length,
      tags: data.data.tags.length,
      maps: data.data.maps.length,
    },
    note: '地图图层不直接存入备份；使用 seed + params 可确定性重建完全相同的图层。',
  }
  const readme = [
    'OC Studio 本地备份',
    '==================',
    '',
    '此 ZIP 由 OC Studio 在本机生成，不包含遥测或在线资源。',
    '',
    '内容：',
    '- oc-data.json：角色、事件、国家、词条、标签、关系（嵌入条目字段）与地图参数/种子。',
    '- manifest.json：备份摘要。',
    '',
    '恢复：在 OC Studio 的“设置 → 数据”中选择“导入 JSON / ZIP...”，选择本文件即可。',
    '地图图层会在导入后按 seed + params 在本地重新计算，因此不需要携带数 MB 的原始图层。',
    '图片二进制仍保存在本地数据目录，不包含在本备份中。',
    '',
    `导出时间：${data.exportedAt}`,
  ].join('\n')
  const blob = createZip([
    { name: 'oc-data.json', data: JSON.stringify(data, null, 2) },
    { name: 'manifest.json', data: JSON.stringify(manifest, null, 2) },
    { name: 'README.txt', data: readme },
  ])
  const name = `oc-studio-backup-${date}.zip`
  downloadBlob(blob, name)
  return { name, size: blob.size }
}

function isCapacitor(): boolean {
  return typeof window !== 'undefined'
    && !!window.Capacitor
    && !window.__TAURI_INTERNALS__
    && !!window.Capacitor.isNativePlatform?.()
}

export function downloadJson(data: unknown, filename?: string): string {
  const json = JSON.stringify(data, null, 2)
  const date = new Date().toISOString().slice(0, 10)
  const name = filename ?? `oc-backup-${date}.ocbak`

  if (isCapacitor()) {
    downloadJsonCapacitor(json, name)
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

export async function exportToMarkdown(): Promise<string> {
  const [characters, events, countries, worldEntries] = await Promise.all([
    db.characters.filter((c) => !c.deleted).toArray(),
    db.events.filter((e) => !e.deleted).toArray(),
    db.countries.filter((c) => !c.deleted).toArray(),
    db.worldEntries.filter((w) => !w.deleted).toArray(),
  ])

  const lines: string[] = []
  const date = new Date().toISOString().slice(0, 10)
  lines.push(`# OC Studio 导出 — ${date}`)
  lines.push('')

  if (characters.length > 0) {
    lines.push('## 角色')
    lines.push('')
    for (const c of characters) {
      lines.push(`### ${c.name}`)
      if (c.aliases.length) lines.push(`- 别名：${c.aliases.join('、')}`)
      if (c.race) lines.push(`- 种族：${c.race}`)
      if (c.element) lines.push(`- 元素：${c.element}`)
      if (c.occupation) lines.push(`- 职业：${c.occupation}`)
      if (c.nationalityLegacy) lines.push(`- 国籍：${c.nationalityLegacy}`)
      if (c.height) lines.push(`- 身高：${c.height}`)
      if (c.birthday) lines.push(`- 生日：${c.birthday}`)
      if (c.bio) { lines.push(''); lines.push(c.bio) }
      if (c.lifeStory) { lines.push(''); lines.push(c.lifeStory) }
      lines.push('')
    }
  }

  if (events.length > 0) {
    lines.push('## 事件')
    lines.push('')
    for (const e of events) {
      lines.push(`### ${e.title}`)
      if (e.time) lines.push(`- 时间：${e.time}${e.endTime ? ` ~ ${e.endTime}` : ''}`)
      if (e.location) lines.push(`- 地点：${e.location}`)
      if (e.isMajor) lines.push(`- 重大事件`)
      if (e.summary) { lines.push(''); lines.push(e.summary) }
      if (e.content) { lines.push(''); lines.push(e.content) }
      lines.push('')
    }
  }

  if (countries.length > 0) {
    lines.push('## 国家')
    lines.push('')
    for (const c of countries) {
      lines.push(`### ${c.name}`)
      if (c.description) { lines.push(''); lines.push(c.description) }
      if (c.system) { lines.push(''); lines.push('**体制**'); lines.push(''); lines.push(c.system) }
      if (c.geography) { lines.push(''); lines.push('**地理**'); lines.push(''); lines.push(c.geography) }
      if (c.culture) { lines.push(''); lines.push('**文化**'); lines.push(''); lines.push(c.culture) }
      lines.push('')
    }
  }

  if (worldEntries.length > 0) {
    lines.push('## 词条')
    lines.push('')
    for (const w of worldEntries) {
      lines.push(`### ${w.title}`)
      if (w.category) lines.push(`- 分类：${w.category}`)
      if (w.content) { lines.push(''); lines.push(w.content) }
      lines.push('')
    }
  }

  return lines.join('\n')
}

export async function exportToTxt(): Promise<string> {
  const [characters, events, countries, worldEntries] = await Promise.all([
    db.characters.filter((c) => !c.deleted).toArray(),
    db.events.filter((e) => !e.deleted).toArray(),
    db.countries.filter((c) => !c.deleted).toArray(),
    db.worldEntries.filter((w) => !w.deleted).toArray(),
  ])

  const lines: string[] = []
  const date = new Date().toISOString().slice(0, 10)
  lines.push(`OC Studio 导出 — ${date}`)
  lines.push('='.repeat(40))
  lines.push('')

  if (characters.length > 0) {
    lines.push('【角色】')
    lines.push('')
    for (const c of characters) {
      lines.push(`  ${c.name}`)
      if (c.aliases.length) lines.push(`  别名：${c.aliases.join('、')}`)
      if (c.race) lines.push(`  种族：${c.race}`)
      if (c.element) lines.push(`  元素：${c.element}`)
      if (c.occupation) lines.push(`  职业：${c.occupation}`)
      if (c.birthday) lines.push(`  生日：${c.birthday}`)
      if (c.bio) { lines.push(''); lines.push(`  ${c.bio.replace(/\n/g, '\n  ')}`) }
      lines.push('')
    }
  }

  if (events.length > 0) {
    lines.push('【事件】')
    lines.push('')
    for (const e of events) {
      lines.push(`  ${e.title}`)
      if (e.time) lines.push(`  时间：${e.time}${e.endTime ? ` ~ ${e.endTime}` : ''}`)
      if (e.location) lines.push(`  地点：${e.location}`)
      if (e.summary) { lines.push(''); lines.push(`  ${e.summary.replace(/\n/g, '\n  ')}`) }
      lines.push('')
    }
  }

  if (countries.length > 0) {
    lines.push('【国家】')
    lines.push('')
    for (const c of countries) {
      lines.push(`  ${c.name}`)
      if (c.description) { lines.push(''); lines.push(`  ${c.description.replace(/\n/g, '\n  ')}`) }
      lines.push('')
    }
  }

  if (worldEntries.length > 0) {
    lines.push('【词条】')
    lines.push('')
    for (const w of worldEntries) {
      lines.push(`  ${w.title}`)
      if (w.category) lines.push(`  分类：${w.category}`)
      if (w.content) { lines.push(''); lines.push(`  ${w.content.replace(/\n/g, '\n  ')}`) }
      lines.push('')
    }
  }

  return lines.join('\n')
}

function downloadText(content: string, filename: string, mimeType: string): void {
  if (isCapacitor()) {
    downloadTextCapacitor(content, filename)
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
  downloadText(md, `oc-export-${date}.md`, 'text/markdown')
}

export async function downloadTxt(): Promise<void> {
  const txt = await exportToTxt()
  const date = new Date().toISOString().slice(0, 10)
  downloadText(txt, `oc-export-${date}.txt`, 'text/plain')
}
