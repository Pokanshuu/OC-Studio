/**
 * 小说 → 导出预览的 `PageDoc`。
 *
 * 预览组件是共用的（`components/shared/document/PagePreview`，导出中心的文档页签
 * 也在用同一份），这里只负责把「一本书 + 章节树」翻成「分区 → 条目」：
 * 整本书一个分区（分区名留空 = 不画分区标题），卷 / 章 / 节靠 `depth` 分两级。
 */
import { pageHtmlFromText, type PageDoc, type PageEntry } from '@/lib/export/page'
import type { NovelExportBook, NovelExportChapter } from './export'

export function novelPageDoc(book: NovelExportBook, chapters: NovelExportChapter[]): PageDoc {
  const entries: PageEntry[] = []
  const synopsis = (book.synopsis ?? '').trim()
  if (synopsis !== '') {
    entries.push({ id: 'synopsis', html: pageHtmlFromText(synopsis), text: synopsis })
  }
  chapters.forEach((chapter, index) => {
    const text = chapter.text.trim()
    entries.push({
      id: `chapter:${index}`,
      title: chapter.title,
      depth: chapter.depth <= 1 ? 1 : 2,
      html: pageHtmlFromText(text),
      text,
    })
  })

  return {
    title: book.title.trim() === '' ? '未命名作品' : book.title.trim(),
    subtitle: book.author?.trim() ? `作者：${book.author.trim()}` : undefined,
    sections: [{ id: 'chapters', entries }],
  }
}
