/**
 * 文档导出的文字形态：Markdown / TXT。
 *
 * 内容与 Word 走同一份 `DocumentModel`（`./document`）—— 以前这里自己读库、自己拼字符串，
 * 于是正文是 HTML 的时候会把 `<p></p>` 原样写进 .md，分区开关也只对角色生效。
 * 现在只负责「模型 → 文本」这一段：`renderMarkdown` / `renderTxt` 是纯函数，
 * 面板拿同一个模型出预览和文件，不会出现「预览是一份、导出又是一份」。
 */
import {
  buildDocumentModel,
  type DocumentBuildOptions,
  type DocumentModel,
  type DocumentSection,
} from './document'

export type { DocumentSection }
export type DocumentExportOptions = DocumentBuildOptions

function inline(value: string): string {
  return value.replace(/\s*\n\s*/g, ' ')
}

export function renderMarkdown(model: DocumentModel): string {
  const lines: string[] = [`# ${model.title}`, '', `> ${model.subtitle}`, '']

  for (const section of model.sections) {
    lines.push(`## ${section.label}`)
    lines.push('')
    for (const entry of section.entries) {
      lines.push(`### ${entry.title}`)
      for (const field of entry.fields) lines.push(`- ${field.label}：${inline(field.value)}`)
      if (entry.text !== '') {
        lines.push('')
        lines.push(entry.text)
      }
      lines.push('')
    }
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
}

export function renderTxt(model: DocumentModel): string {
  const lines: string[] = [
    model.title,
    '='.repeat(Math.max(8, model.title.length * 2)),
    model.subtitle,
    '',
  ]

  for (const section of model.sections) {
    lines.push(`【${section.label}】`)
    lines.push('')
    for (const entry of section.entries) {
      lines.push(`  ${entry.title}`)
      for (const field of entry.fields) lines.push(`  ${field.label}：${inline(field.value)}`)
      if (entry.text !== '') {
        lines.push('')
        lines.push(entry.text.replace(/^/gm, '  '))
      }
      lines.push('')
    }
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
}

export async function exportToMarkdown(options: DocumentExportOptions = {}): Promise<string> {
  return renderMarkdown(await buildDocumentModel(options))
}

export async function exportToTxt(options: DocumentExportOptions = {}): Promise<string> {
  return renderTxt(await buildDocumentModel(options))
}
