/**
 * 静态站版式的**唯一契约**（视觉层）。
 *
 * 一套版式 = 一个外壳形态（侧栏 / 顶栏）+ 一段追加 CSS。基础样式在
 * `styles.ts`（所有版式共用），这里只覆盖「排法与节奏」，不重复写基础规则。
 *
 * 版式 CSS 会被**原样内联**进导出的单文件 HTML，因此：
 * - 不依赖 Tailwind / 构建产物；
 * - 只写 `.topbar`、`body[data-template="archive"] ...` 这一类选择器；
 * - 颜色只用 `var(--paper / --ink / --line / --hover ...)`，跟随纸色选择。
 */

export type SiteTemplateId = 'book' | 'archive' | 'gallery'

export type SiteShell = 'sidebar' | 'topbar'

/**
 * 首页头图处理：
 * - `banner` 纸书：封面作为一条 3:1 的横幅
 * - `full`   画廊：封面满幅铺开、标题压在上面
 * - `none`   无封面时保持标题排版
 */
export type SiteHero = 'banner' | 'full' | 'none'

export interface SiteTemplateMeta {
  id: SiteTemplateId
  name: string
  /** 一句观感，≤ 10 字 */
  hint: string
  shell: SiteShell
  hero: SiteHero
  /** 追加在基础样式之后的 CSS 字符串 */
  css: string
}

export const SITE_TEMPLATE_IDS: SiteTemplateId[] = ['book', 'archive', 'gallery']

export const DEFAULT_SITE_TEMPLATE: SiteTemplateId = 'book'
