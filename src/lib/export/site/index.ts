import { db } from '@/lib/db'
import { getTemplates } from '@/lib/templates/store'
import { getFieldConfig } from '@/lib/fields/store'
import { downloadText } from '../download'
import { urlToDataUri } from '../payload'
import {
  applySiteSections,
  buildSite,
  collectSiteImages,
  type BuildOptions,
  type SiteData,
  type SiteSectionOptions,
  type SiteThemeTokens,
} from './build'
import type { SiteTemplateId } from './template-types'

export { applySiteSections, buildSite, collectSiteImages } from './build'
export type { SiteData, BuildOptions, SiteSectionOptions, SiteThemeTokens } from './build'
export { SITE_TEMPLATES, siteTemplateOf } from './templates'
export type { SiteTemplateId, SiteTemplateMeta, SiteShell, SiteHero } from './template-types'
export { renderRichText, plainTextOf, hasRichText, collectDocImages, escapeHtml } from './render'

/** 一次静态站导出的配置（弹窗只负责收集，真正的开关语义在 `buildSite` 里）。 */
export interface SiteExportConfig {
  /** 站点标题；空 = 世界名 */
  title?: string
  /** 分区开关；缺省全开 */
  sections?: Partial<SiteSectionOptions>
  /** 固定纸色；缺省跟随读者系统 */
  theme?: SiteThemeTokens
  /** 是否把图片内联成 data URI（默认 true；单文件离线打开需要） */
  inlineImages?: boolean
  /** 版式：书斋 / 档案 / 画廊 */
  template?: SiteTemplateId
}

/** 从当前会话读一份静态站数据（软删除的行不导出）。 */
export async function loadSiteData(): Promise<SiteData> {
  const [characters, events, countries, worldEntries, tags, periods, metaRows] = await Promise.all([
    db.characters.filter((c) => !c.deleted).toArray(),
    db.events.filter((e) => !e.deleted).toArray(),
    db.countries.filter((c) => !c.deleted).toArray(),
    db.worldEntries.filter((w) => !w.deleted).toArray(),
    db.tags.toArray(),
    db.periods.filter((p) => !p.deleted).toArray(),
    db.meta.toArray(),
  ])

  return {
    meta: metaRows[0] ?? null,
    characters,
    events,
    countries,
    worldEntries,
    tags,
    periods,
  }
}

/** 把数据里引用的图片转成 data URI（预览与导出共用，避免两套转换）。 */
export async function prepareSiteImages(data: SiteData): Promise<Map<string, string>> {
  const images = new Map<string, string>()
  for (const url of collectSiteImages(data)) {
    const dataUri = await urlToDataUri(url)
    if (dataUri) images.set(url, dataUri)
  }
  return images
}

/**
 * 生成单文件静态展示站的 HTML。
 *
 * 一个文件 = 一个可发布的网站：内容、样式、脚本、图片（内联 data URI）全在里面，
 * 直接改名 `index.html` 丢到 GitHub Pages / 任意静态托管就能看，也能双击离线打开。
 * 页面切换靠 hash 路由（`#/characters/3`），因此**深链接仍然有效**。
 */
export async function buildStaticSite(config: SiteExportConfig = {}): Promise<string> {
  const data = applySiteSections(await loadSiteData(), config.sections)
  const images = config.inlineImages === false ? new Map<string, string>() : await prepareSiteImages(data)

  const options: BuildOptions = {
    images,
    title: config.title,
    sections: config.sections,
    theme: config.theme,
    template: config.template,
    // 详情页的标题 / 显隐跟编辑器模板一致；没读过模板时 `getTemplates()` 是内置默认。
    // 事件的时间 / 地点跟字段表走（它们已经并回「基本信息」，不再是模板组件）
    templates: getTemplates(),
    fields: getFieldConfig(),
  }
  return buildSite(data, options)
}

/** 导出并下载静态展示站。返回文件名。 */
export async function exportStaticSite(config: SiteExportConfig = {}): Promise<string> {
  const html = await buildStaticSite(config)
  await downloadText(html, 'index.html', 'text/html')
  return 'index.html'
}
