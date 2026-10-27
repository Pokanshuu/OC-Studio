import { db } from '@/lib/db'
import { downloadText } from '../download'
import { urlToDataUri } from '../payload'
import { buildSite, collectSiteImages, type SiteData } from './build'

export { buildSite, collectSiteImages } from './build'
export type { SiteData, BuildOptions } from './build'
export { renderRichText, plainTextOf, hasRichText, collectDocImages, escapeHtml } from './render'

/**
 * 生成单文件静态展示站的 HTML。
 *
 * 一个文件 = 一个可发布的网站：内容、样式、脚本、图片（内联 data URI）全在里面，
 * 直接改名 `index.html` 丢到 GitHub Pages / 任意静态托管就能看，也能双击离线打开。
 * 页面切换靠 hash 路由（`#/characters/3`），因此**深链接仍然有效**。
 */
export async function buildStaticSite(): Promise<string> {
  const [characters, events, countries, worldEntries, tags, periods, metaRows] = await Promise.all([
    db.characters.filter((c) => !c.deleted).toArray(),
    db.events.filter((e) => !e.deleted).toArray(),
    db.countries.filter((c) => !c.deleted).toArray(),
    db.worldEntries.filter((w) => !w.deleted).toArray(),
    db.tags.toArray(),
    db.periods.filter((p) => !p.deleted).toArray(),
    db.meta.toArray(),
  ])

  const data: SiteData = {
    meta: metaRows[0] ?? null,
    characters,
    events,
    countries,
    worldEntries,
    tags,
    periods,
  }

  const images = new Map<string, string>()
  for (const url of collectSiteImages(data)) {
    const dataUri = await urlToDataUri(url)
    if (dataUri) images.set(url, dataUri)
  }

  return buildSite(data, { images })
}

/** 导出并下载静态展示站。返回文件名。 */
export async function exportStaticSite(): Promise<string> {
  const html = await buildStaticSite()
  await downloadText(html, 'index.html', 'text/html')
  return 'index.html'
}
