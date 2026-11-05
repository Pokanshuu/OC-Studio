'use client'

/**
 * 文档预览：把一份 `PageDoc` 画成**一页纸**。
 *
 * 导出中心的「文档」页签和小说导出用的是同一个组件 —— 两边都只是把各自的数据
 * 映射成 `PageDoc`（`lib/export/page`），排版、字号、行距只有这一份实现，
 * 所以「预览里长什么样」在两个入口里是一致的。
 *
 * 纸面按 A4 比例（210mm），字号与行距对着 Word 的 A4 正文长；不承诺逐页翻转 ——
 * 分页交给 Word，预览只保证排版可信。正文样式在 `globals.css` 的 `.oc-doc-prose`。
 */
import { pageDocIsEmpty, type PageDoc, type PageEntry } from '@/lib/export/page'

function EntryTitle({ entry }: { entry: PageEntry }) {
  if ((entry.title ?? '').trim() === '') return null
  if (entry.depth === 2) {
    return <h4 className="text-[13px] font-semibold leading-snug">{entry.title}</h4>
  }
  return <h3 className="text-[14px] font-semibold leading-snug">{entry.title}</h3>
}

export interface PagePreviewProps {
  doc: PageDoc
  /** 空态文案；缺省「没有可导出的内容」 */
  emptyHint?: string
}

export function PagePreview({ doc, emptyHint = '没有可导出的内容' }: PagePreviewProps) {
  if (pageDocIsEmpty(doc)) {
    return (
      <div className="flex h-full items-center justify-center text-[12px] text-ink-faint">
        {emptyHint}
      </div>
    )
  }

  return (
    <div className="flex h-full items-start justify-center overflow-auto py-6">
      <article
        data-page-sheet
        className="w-[210mm] max-w-full shrink-0 border border-line bg-paper px-6 py-8 text-ink md:px-[18mm] md:py-[16mm]"
        style={{ minHeight: '297mm' }}
      >
        <header className="mb-8 text-center">
          <h1 className="font-serif text-[26px] font-bold leading-tight tracking-[0.02em]">
            {doc.title}
          </h1>
          {doc.subtitle ? <p className="mt-2 text-[11px] text-ink-faint">{doc.subtitle}</p> : null}
        </header>

        {doc.sections.map((section) => (
          <section key={section.id} className="mt-9 first:mt-8">
            {section.label ? (
              <>
                <h2 className="font-serif text-[17px] font-semibold leading-tight">{section.label}</h2>
                <div className="mt-2 h-px w-full bg-line" />
              </>
            ) : null}

            <div className={`flex flex-col gap-7 ${section.label ? 'mt-4' : 'mt-1'}`}>
              {section.entries.map((entry) => (
                <div key={entry.id} data-page-entry>
                  <EntryTitle entry={entry} />

                  {entry.fields?.length ? (
                    <dl className="mt-1.5 flex flex-col gap-0.5">
                      {entry.fields.map((field) => (
                        <div key={field.label} className="flex gap-2 text-[12.5px] leading-[1.7]">
                          <dt className="w-[4.5em] shrink-0 text-ink-faint">{field.label}</dt>
                          <dd className="min-w-0 flex-1 whitespace-pre-wrap">{field.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}

                  {entry.html?.trim() ? (
                    <div className="oc-doc-prose mt-2" dangerouslySetInnerHTML={{ __html: entry.html }} />
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </article>
    </div>
  )
}
