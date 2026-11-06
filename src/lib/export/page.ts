/**
 * **一页文档**的中性模型：谁都能往里填，预览只认这一份。
 *
 * 出处有两个，形状不同但都是「纸上的东西」：
 * - 导出中心的文档页签：角色 / 事件 / 国家 / 词条 → 分区 → 条目（字段 + 正文）
 * - 小说导出：一本书 → 章节（卷 / 章 / 节）
 *
 * 于是这里只描述「分区 → 条目 → 字段 + 正文」，分区可以没有名字（小说只有一「卷」），
 * 条目可以没有字段（章节只有正文）。渲染在 `components/shared/document/PagePreview`，
 * 导出格式（Word / Markdown / TXT）各自从自己的源模型序列化 —— 只有**预览**共用，
 * 免得为了共用把导出也拧成一种格式。
 */
import { plainTextToHtml } from './site/render'

export interface PageField {
  label: string
  value: string
}

export interface PageEntry {
  id: string
  title?: string
  /** 标题层级：1 = 章节级（更大、更松），2 = 小节；缺省 1 */
  depth?: 1 | 2
  fields?: PageField[]
  /** 正文 HTML（预览用；来自 `lib/export/site/render` 或 canonical 文本） */
  html?: string
  /** 正文纯文本（导出用） */
  text?: string
}

export interface PageSection {
  id: string
  /** 分区名；没有就不画分区标题与横线（小说就是这种） */
  label?: string
  entries: PageEntry[]
}

export interface PageDoc {
  title: string
  subtitle?: string
  sections: PageSection[]
}

export function pageDocIsEmpty(doc: PageDoc): boolean {
  return doc.sections.every((section) => section.entries.length === 0)
}

/** 条目总数（面板右上角的口径）。 */
export function pageDocEntryCount(doc: PageDoc): number {
  return doc.sections.reduce((sum, section) => sum + section.entries.length, 0)
}

/** 正文字数（去空白；字段值也算 —— 面板上那一行要看的是「这份文档有多长」）。 */
export function pageDocCharCount(doc: PageDoc): number {
  let count = 0
  const add = (value: string | undefined): void => {
    count += (value ?? '').replace(/\s+/g, '').length
  }
  for (const section of doc.sections) {
    for (const entry of section.entries) {
      add(entry.title)
      add(entry.text)
      for (const field of entry.fields ?? []) {
        add(field.label)
        add(field.value)
      }
    }
  }
  return count
}

/**
 * 纯文本 → 预览用的 HTML：空行分段、单换行当段内换行。
 * 小说章节是纯文本，进预览前用这个补齐 `<p>`，和文档页签的正文长得一样。
 */
export function pageHtmlFromText(text: string | undefined): string {
  const value = (text ?? '').trim()
  return value === '' ? '' : plainTextToHtml(value)
}
