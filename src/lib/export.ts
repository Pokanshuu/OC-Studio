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
    periods: unknown[]
  }
}

export async function exportAllData(): Promise<ExportPayload> {
  const [characters, events, countries, worldEntries, tags, periods] = await Promise.all([
    db.characters.filter((c) => !c.deleted).toArray(),
    db.events.filter((e) => !e.deleted).toArray(),
    db.countries.filter((c) => !c.deleted).toArray(),
    db.worldEntries.filter((w) => !w.deleted).toArray(),
    db.tags.toArray(),
    db.periods.filter((p) => !p.deleted).toArray(),
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
      periods,
    },
  }
}

function isCapacitor(): boolean {
  return typeof window !== 'undefined'
    && !!window.Capacitor
    && !window.__TAURI_INTERNALS__
    && !!window.Capacitor.isNativePlatform?.()
}

export async function downloadJson(data: unknown, filename?: string): Promise<string> {
  const json = JSON.stringify(data, null, 2)
  const date = new Date().toISOString().slice(0, 10)
  const name = filename ?? `oc-backup-${date}.ocbak`

  if (isCapacitor()) {
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

async function downloadText(content: string, filename: string, mimeType: string): Promise<void> {
  if (isCapacitor()) {
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
