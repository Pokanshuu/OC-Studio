/**
 * 静态展示站的**三套版式**（纯数据，不碰任何共享文件）。
 *
 * 契约见 `./template-types`：一套版式 = 外壳形态（sidebar / topbar）+ 首页头图处理
 * （banner / full）+ 一段追加 CSS。基础样式在 `./styles`（三套共用），这里只覆盖
 * 「排法与节奏」，不重复基础规则。
 *
 * 三条硬约束（改之前先读）：
 * - 版式 CSS 原样内联进导出的单文件 HTML：不依赖 Tailwind / 外部字体 / 网络资源；
 * - 颜色只用 `var(--paper / --paper-alt / --paper-card / --line / --line-hover / --ink /
 *   --ink-muted / --ink-faint / --hover / --radius)`，纸色由读者系统或导出配置决定；
 * - 选择器一律带 `body[data-template="..."]` 前缀：基础样式排在前面、优先级相同，
 *   加前缀（更高优先级）才能稳定压过基础规则，同时让三套版式互不串味。
 *
 * 选择器照 `build.ts` 输出的 class 写。首页结构：
 *   section.page[data-route="home"] > img.cover / h1.page-title / p.page-sub /
 *   div.stats / h2.section-title / div.grid > a.card / div.rows > a.row
 * 详情页的 route 形如 `characters/3`，用 `[data-route*="/"]` 判断「不是列表页」。
 */

import type { SiteTemplateId, SiteTemplateMeta } from './template-types'
import { DEFAULT_SITE_TEMPLATE, SITE_TEMPLATE_IDS } from './template-types'

/**
 * 书斋 —— 基础样式本来就是这个观感，这里只做精修：
 * 衬线层级更讲究、侧栏呼吸更松、详情页收到 720px 正文列、卡片网格保持细线节奏。
 */
const BOOK_CSS = `
body[data-template="book"] .sidebar { flex: 0 0 252px; padding: 44px 26px 64px; }
body[data-template="book"] .brand { margin-bottom: 34px; }
body[data-template="book"] .brand .world { font-size: 20px; line-height: 1.26; letter-spacing: 0.004em; }
body[data-template="book"] .brand .tagline { margin-top: 8px; font-size: 11px; font-style: italic; letter-spacing: 0.02em; }
body[data-template="book"] .nav { gap: 1px; }
body[data-template="book"] .nav a { min-height: 34px; padding: 6px 10px; letter-spacing: 0.012em; }
body[data-template="book"] .nav .count { font-size: 10px; }

/* 一张纸的版心：列表页 860，详情页 720（正文的行长才是「书」的关键） */
body[data-template="book"] .main { padding: 52px 56px 104px; }
body[data-template="book"] .page { max-width: 860px; }
body[data-template="book"] .page[data-route*="/"] { max-width: 720px; }
body[data-template="book"] .footer { max-width: 860px; }

body[data-template="book"] .cover { aspect-ratio: 3 / 1; margin-bottom: 30px; }
body[data-template="book"] .page-title { font-size: 30px; line-height: 1.24; letter-spacing: -0.004em; }
body[data-template="book"] .page[data-route*="/"] .page-title { font-size: 27px; }
body[data-template="book"] .page-sub { margin-top: 12px; font-size: 13px; }
body[data-template="book"] .section-title { margin: 42px 0 16px; font-size: 16px; letter-spacing: 0.012em; }

body[data-template="book"] .grid { grid-template-columns: repeat(auto-fill, minmax(248px, 1fr)); }
body[data-template="book"] .card { padding: 20px; }
body[data-template="book"] .card .thumb { margin-bottom: 14px; }
body[data-template="book"] .card .name { font-size: 16px; letter-spacing: 0.008em; }
body[data-template="book"] .card .meta { margin-top: 6px; }
body[data-template="book"] .card .excerpt { margin-top: 9px; line-height: 1.7; }

body[data-template="book"] .doc { font-size: 15px; line-height: 1.95; }
body[data-template="book"] .doc p { margin-bottom: 14px; }
body[data-template="book"] .doc h2 { font-size: 19px; margin-top: 28px; }
body[data-template="book"] .doc h3 { font-size: 17px; }
body[data-template="book"] .fields { margin: 26px 0; }
body[data-template="book"] .field { padding-block: 10px; }
/* 头像仍咬住头图下缘，标题从图下开始（基础样式把整块 head 提起来，标题会压在图上） */
body[data-template="book"] .banner + .head { margin-top: 0; }
body[data-template="book"] .banner + .head .avatar { margin-top: -52px; }

@media (max-width: 767px) {
  body[data-template="book"] .sidebar { padding: 18px 18px 8px; }
  body[data-template="book"] .brand { margin-bottom: 14px; }
  body[data-template="book"] .brand .world { font-size: 17px; }
  body[data-template="book"] .main { padding: 30px 18px 64px; }
  body[data-template="book"] .page-title,
  body[data-template="book"] .page[data-route*="/"] .page-title { font-size: 24px; }
  body[data-template="book"] .section-title { margin: 34px 0 12px; }
  body[data-template="book"] .grid { grid-template-columns: 1fr; }
  body[data-template="book"] .doc { font-size: 14.5px; line-height: 1.9; }
}

@media print {
  body[data-template="book"] .main { padding: 0; }
  body[data-template="book"] .page,
  body[data-template="book"] .page[data-route*="/"],
  body[data-template="book"] .footer { max-width: none; }
}
`

/**
 * 档案 —— 贴顶的细线导航条 + 全站等宽编号与元数据 + 1px 线密排的卡片与字段表。
 * 密度高、秩序强、没有圆角（`--radius` 在这一套里直接归零）。
 */
const ARCHIVE_CSS = `
body[data-template="archive"] { --mono: ui-monospace, "SFMono-Regular", Consolas, monospace; --radius: 0px; }

body[data-template="archive"] .layout { display: block; }

/* 顶部导航：吸顶、单行、底线收口 */
body[data-template="archive"] .topbar {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; gap: 36px;
  min-height: 56px; padding: 0 32px;
  background: var(--paper);
  border-bottom: 1px solid var(--line);
}
body[data-template="archive"] .topbar .brand { display: flex; align-items: baseline; gap: 10px; flex: 0 0 auto; margin: 0; }
body[data-template="archive"] .topbar .brand .world { font-size: 15px; line-height: 1.4; letter-spacing: 0.04em; }
body[data-template="archive"] .topbar .brand .tagline { margin: 0; font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; color: var(--ink-faint); }

body[data-template="archive"] .topbar .nav {
  flex-direction: row; flex-wrap: nowrap; gap: 22px;
  margin-left: auto; min-width: 0;
  overflow-x: auto; scrollbar-width: none;
  counter-reset: nav 0;
}
body[data-template="archive"] .topbar .nav::-webkit-scrollbar { display: none; }
body[data-template="archive"] .topbar .nav a {
  justify-content: flex-start; gap: 6px;
  min-height: 56px; padding: 0;
  border-left: 0; border-bottom: 2px solid transparent;
  font-size: 12px; letter-spacing: 0.03em; white-space: nowrap;
}
/* 导航编号由 CSS counter 生成：01 / 02 / 03 …（不往 HTML 里塞序号） */
body[data-template="archive"] .topbar .nav a::before {
  counter-increment: nav 1;
  content: counter(nav, decimal-leading-zero);
  margin-right: 1px;
  font-family: var(--mono); font-size: 10px;
  letter-spacing: 0.04em; color: var(--ink-faint);
}
body[data-template="archive"] .topbar .nav a:hover { background: none; color: var(--ink); }
body[data-template="archive"] .topbar .nav a:hover::before { color: var(--ink-muted); }
body[data-template="archive"] .topbar .nav a.on {
  border-left-color: transparent;
  border-bottom-color: var(--ink);
  font-weight: 600;
}
body[data-template="archive"] .topbar .nav a.on::before { color: var(--ink); }
body[data-template="archive"] .topbar .nav .count { font-family: var(--mono); font-size: 10px; letter-spacing: 0.02em; }

body[data-template="archive"] .main { counter-reset: index 0; padding: 36px 40px 92px; }
body[data-template="archive"] .page { max-width: 980px; counter-increment: index; counter-reset: chapter 0; }
body[data-template="archive"] .footer { max-width: 980px; font-family: var(--mono); font-size: 10px; letter-spacing: 0.06em; }

/* 首页：横幅更窄（2.4:1），标题下加一枚档案编号 */
body[data-template="archive"] .page[data-route="home"] .cover { aspect-ratio: 12 / 5; margin-bottom: 20px; }
body[data-template="archive"] .page[data-route="home"] > .page-title::after {
  content: "档案 " counter(index, decimal-leading-zero);
  display: block; margin-top: 9px;
  font-family: var(--mono); font-size: 10px;
  letter-spacing: 0.26em; color: var(--ink-faint);
}

body[data-template="archive"] .page-title { font-size: 26px; line-height: 1.3; letter-spacing: -0.004em; }
body[data-template="archive"] .page-sub { margin-top: 8px; font-family: var(--mono); font-size: 11px; letter-spacing: 0.04em; }
body[data-template="archive"] .section-title {
  margin: 34px 0 12px; padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
  font-size: 14px; letter-spacing: 0.04em;
  counter-increment: chapter;
}
body[data-template="archive"] .section-title::before {
  content: counter(chapter, decimal-leading-zero) " / ";
  margin-right: 8px;
  font-family: var(--mono); font-size: 10px;
  letter-spacing: 0.08em; color: var(--ink-faint); vertical-align: 1px;
}

/* 列表：行更紧，日期与元数据走等宽 */
body[data-template="archive"] .rows { border-top: 0; }
body[data-template="archive"] .row { gap: 20px; padding-block: 9px; }
body[data-template="archive"] .row .when { flex: 0 0 128px; padding-top: 3px; font-family: var(--mono); font-size: 11px; letter-spacing: 0.02em; }
body[data-template="archive"] .row .title { font-size: 14px; letter-spacing: 0.008em; }
body[data-template="archive"] .row .note { margin-top: 3px; font-size: 11.5px; }

body[data-template="archive"] .grid { grid-template-columns: repeat(auto-fill, minmax(196px, 1fr)); }
body[data-template="archive"] .card { padding: 14px; }
body[data-template="archive"] .card .thumb { margin-bottom: 10px; }
body[data-template="archive"] .card .name { font-size: 14px; letter-spacing: 0.008em; }
body[data-template="archive"] .card .meta { margin-top: 6px; font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.02em; line-height: 1.6; }
body[data-template="archive"] .card .excerpt { margin-top: 7px; font-size: 11px; line-height: 1.65; }

/* 字段表当作档案卡：整块 1px 框，键列等宽、行长固定 */
body[data-template="archive"] .fields { margin: 24px 0; border: 1px solid var(--line); border-bottom: 0; }
body[data-template="archive"] .field { gap: 18px; padding: 8px 12px; font-size: 12.5px; }
body[data-template="archive"] .field .key { flex: 0 0 100px; font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; line-height: 1.95; }
body[data-template="archive"] .field .val { font-size: 12.5px; }
body[data-template="archive"] .chip { padding: 1px 6px; font-family: var(--mono); font-size: 10px; letter-spacing: 0.04em; }

body[data-template="archive"] .stats { gap: 44px; margin: 20px 0 6px; }
body[data-template="archive"] .stat .num { font-family: var(--mono); font-size: 21px; letter-spacing: 0.02em; }
body[data-template="archive"] .stat .label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em; }

body[data-template="archive"] .crumb { font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.08em; margin-bottom: 16px; }
body[data-template="archive"] .head { gap: 20px; }
body[data-template="archive"] .head .avatar { width: 84px; height: 84px; }
body[data-template="archive"] .banner + .head { margin-top: 0; }
body[data-template="archive"] .banner + .head .avatar { margin-top: -44px; }
body[data-template="archive"] .gallery { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
body[data-template="archive"] .gallery figcaption { font-family: var(--mono); font-size: 10px; letter-spacing: 0.03em; }

body[data-template="archive"] .doc { font-size: 13.5px; line-height: 1.8; }
body[data-template="archive"] .doc h2 { font-size: 16px; margin-top: 22px; }
body[data-template="archive"] .doc h3 { font-size: 15px; }
body[data-template="archive"] .doc blockquote { border-left-color: var(--line-hover); }

body[data-template="archive"] .rel-table { font-size: 12.5px; }
body[data-template="archive"] .rel-table th,
body[data-template="archive"] .rel-table td { padding: 8px 10px; }
body[data-template="archive"] .rel-table th { font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; }

body[data-template="archive"] .empty { padding: 32px 0; font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em; }

@media (max-width: 767px) {
  body[data-template="archive"] .topbar { min-height: 52px; gap: 14px; padding: 0 16px; }
  body[data-template="archive"] .topbar .brand .tagline { display: none; }
  body[data-template="archive"] .topbar .nav { gap: 16px; }
  body[data-template="archive"] .topbar .nav a { min-height: 52px; }
  body[data-template="archive"] .main { padding: 24px 16px 76px; }
  body[data-template="archive"] .page-title { font-size: 22px; }
  body[data-template="archive"] .grid { grid-template-columns: 1fr; }
  body[data-template="archive"] .row { gap: 12px; }
  body[data-template="archive"] .row .when { flex: 0 0 88px; }
  body[data-template="archive"] .field { padding: 8px 10px; }
  body[data-template="archive"] .field .key { flex: 0 0 78px; }
  body[data-template="archive"] .gallery { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media print {
  body[data-template="archive"] .topbar { display: none; background: none; }
  body[data-template="archive"] .layout { display: block; }
  body[data-template="archive"] .main { padding: 0; }
  body[data-template="archive"] .page,
  body[data-template="archive"] .footer { max-width: none; }
  body[data-template="archive"] .page[data-route="home"] .cover { display: none; }
  body[data-template="archive"] .section-title::before { color: var(--ink-muted); }
}
`

/**
 * 画廊 —— 作品集：封面满幅出血、大标题压在封面下缘、顶部栏半透明吸顶、
 * 卡片三列（窄屏两列 / 一列）、大留白大字。
 *
 * 出血不用 `100vw`（它把滚动条宽度也算进去，桌面上会横向溢出）：
 * 首页的 `.page` 铺满、由各子元素自己收进版心；详情页的头图用负 margin 吃掉页面内边距。
 */
const GALLERY_CSS = `
body[data-template="gallery"] { --mono: ui-monospace, "SFMono-Regular", Consolas, monospace; --column: 1120px; --gutter: 48px; }

body[data-template="gallery"] .layout { display: block; }

/* 顶部栏：半透明吸顶，没有底线，靠模糊与内容分开 */
body[data-template="gallery"] .topbar {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; gap: 40px;
  min-height: 64px; padding: 0 var(--gutter);
  background: var(--paper);
  background: color-mix(in srgb, var(--paper) 84%, transparent);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid transparent;
}
body[data-template="gallery"] .topbar .brand { display: flex; align-items: baseline; gap: 12px; flex: 0 0 auto; margin: 0; }
body[data-template="gallery"] .topbar .brand .world { font-size: 16px; line-height: 1.4; letter-spacing: 0.01em; }
body[data-template="gallery"] .topbar .brand .tagline { margin: 0; font-size: 10px; letter-spacing: 0.16em; color: var(--ink-faint); }
body[data-template="gallery"] .topbar .nav {
  flex-direction: row; flex-wrap: nowrap; gap: 26px;
  margin-left: auto; min-width: 0;
  overflow-x: auto; scrollbar-width: none;
}
body[data-template="gallery"] .topbar .nav::-webkit-scrollbar { display: none; }
body[data-template="gallery"] .topbar .nav a {
  justify-content: flex-start; gap: 7px;
  min-height: 64px; padding: 0;
  border-left: 0; border-bottom: 1px solid transparent;
  font-size: 11.5px; letter-spacing: 0.1em; white-space: nowrap;
}
body[data-template="gallery"] .topbar .nav a:hover { background: none; color: var(--ink); }
body[data-template="gallery"] .topbar .nav a.on {
  border-left-color: transparent;
  border-bottom-color: var(--ink);
  color: var(--ink); font-weight: 500;
}
body[data-template="gallery"] .topbar .nav .count { font-family: var(--mono); font-size: 10px; letter-spacing: 0; }

body[data-template="gallery"] .main { padding: 0 0 112px; }
body[data-template="gallery"] .page { max-width: var(--column); margin: 0 auto; padding: 76px var(--gutter) 0; }
body[data-template="gallery"] .footer { max-width: var(--column); margin: 0 auto; padding: 40px var(--gutter) 0; font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; }

/* 首页：封面满幅，标题压在下缘（正文列仍对齐 1120 版心） */
body[data-template="gallery"] .page[data-route="home"] { max-width: none; padding: 0; }
body[data-template="gallery"] .page[data-route="home"] > .cover {
  width: 100%; height: 62vh; min-height: 340px; max-height: 780px;
  aspect-ratio: auto; object-fit: cover; margin: 0;
  background: var(--paper-card);
}
body[data-template="gallery"] .page[data-route="home"] > .page-title {
  position: relative;
  max-width: var(--column); margin: -72px auto 0;
  padding: 28px var(--gutter) 0;
  background: var(--paper);
  font-size: clamp(34px, 5.2vw, 68px);
  line-height: 1.06; letter-spacing: -0.018em;
}
/* 没有封面时标题就是第一个孩子：给足留白，不再压图 */
body[data-template="gallery"] .page[data-route="home"] > .page-title:first-child {
  margin-top: 0; padding-top: 168px;
}
body[data-template="gallery"] .page[data-route="home"] > :not(.cover):not(.page-title) {
  max-width: var(--column);
  margin-left: auto; margin-right: auto;
  padding-left: var(--gutter); padding-right: var(--gutter);
}

/* 详情页：头图吃掉页面内边距做整栏，正文收到 780 的阅读宽度 */
body[data-template="gallery"] .page[data-route*="/"] { max-width: 1080px; padding: 52px var(--gutter) 0; }
body[data-template="gallery"] .page[data-route*="/"] > .banner,
body[data-template="gallery"] .page[data-route*="/"] > .entry-cover {
  width: calc(100% + var(--gutter) * 2);
  margin-left: calc(var(--gutter) * -1);
  margin-bottom: 30px;
}
body[data-template="gallery"] .page[data-route*="/"] > .banner { aspect-ratio: 21 / 8; }
body[data-template="gallery"] .page[data-route*="/"] > .entry-cover { aspect-ratio: 16 / 9; }
body[data-template="gallery"] .doc { font-size: 15px; line-height: 1.9; max-width: 780px; }
body[data-template="gallery"] .doc h2 { font-size: 21px; margin-top: 30px; }
body[data-template="gallery"] .doc h3 { font-size: 18px; }

body[data-template="gallery"] .page-title { font-size: clamp(30px, 3.6vw, 44px); line-height: 1.1; letter-spacing: -0.014em; }
body[data-template="gallery"] .page-sub { margin-top: 14px; font-size: 14px; letter-spacing: 0.01em; }
body[data-template="gallery"] .section-title {
  margin: 64px 0 24px;
  font-family: -apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
  font-size: 11px; font-weight: 500; letter-spacing: 0.2em;
  color: var(--ink-muted);
}

body[data-template="gallery"] .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 46px 32px; }
body[data-template="gallery"] .card { padding: 0; margin: 0; border: 0; background: none; }
body[data-template="gallery"] .card:hover { background: none; }
body[data-template="gallery"] .card .thumb { margin-bottom: 16px; transition: opacity 0.2s ease; }
body[data-template="gallery"] .card:hover .thumb { opacity: 0.86; }
body[data-template="gallery"] .card .name { font-size: 19px; font-weight: 400; letter-spacing: 0.004em; }
body[data-template="gallery"] .card:hover .name { text-decoration: underline; text-underline-offset: 4px; }
body[data-template="gallery"] .card .meta { margin-top: 6px; font-family: var(--mono); font-size: 10px; letter-spacing: 0.08em; color: var(--ink-faint); }
body[data-template="gallery"] .card .excerpt { margin-top: 10px; font-size: 12.5px; line-height: 1.7; -webkit-line-clamp: 2; }

body[data-template="gallery"] .row { gap: 32px; padding-block: 16px; }
body[data-template="gallery"] .row:hover { background: none; }
body[data-template="gallery"] .row:hover .title { text-decoration: underline; text-underline-offset: 4px; }
body[data-template="gallery"] .row .when { flex: 0 0 128px; padding-top: 5px; font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.06em; }
body[data-template="gallery"] .row .title { font-size: 17px; font-weight: 400; }
body[data-template="gallery"] .row .note { margin-top: 5px; font-size: 12px; }

body[data-template="gallery"] .stats { gap: 64px; margin-top: 44px; }
body[data-template="gallery"] .stat .num { font-size: 38px; line-height: 1; }
body[data-template="gallery"] .stat .label { margin-top: 8px; font-family: var(--mono); font-size: 10px; letter-spacing: 0.2em; }

body[data-template="gallery"] .fields { margin: 32px 0; }
body[data-template="gallery"] .field { gap: 24px; padding-block: 12px; }
body[data-template="gallery"] .field .key { flex: 0 0 108px; font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; line-height: 2; }
body[data-template="gallery"] .field .val { font-size: 13px; }
body[data-template="gallery"] .chips { gap: 8px; }
body[data-template="gallery"] .chip { padding: 3px 10px; font-size: 10px; letter-spacing: 0.06em; }

body[data-template="gallery"] .head { gap: 26px; }
body[data-template="gallery"] .head .avatar { width: 112px; height: 112px; }
body[data-template="gallery"] .banner + .head { margin-top: 0; }
body[data-template="gallery"] .banner + .head .avatar { margin-top: -64px; }
body[data-template="gallery"] .gallery { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin: 22px 0; }
body[data-template="gallery"] .gallery figure { border: 0; margin: 0; background: none; }
body[data-template="gallery"] .gallery figcaption { padding: 8px 0 0; font-size: 10.5px; letter-spacing: 0.04em; }

body[data-template="gallery"] .rel-table th,
body[data-template="gallery"] .rel-table td { padding: 14px 8px 14px 0; }
body[data-template="gallery"] .rel-table th { font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; }
body[data-template="gallery"] .rel-table td { font-size: 13px; }
body[data-template="gallery"] .crumb { font-size: 10.5px; letter-spacing: 0.14em; margin-bottom: 26px; }
body[data-template="gallery"] .empty { padding: 72px 0; }

@media (max-width: 1023px) {
  body[data-template="gallery"] .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 38px 26px; }
  body[data-template="gallery"] .gallery { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  body[data-template="gallery"] .page[data-route="home"] > .page-title { margin-top: -60px; }
  body[data-template="gallery"] .row { gap: 22px; }
}

@media (max-width: 767px) {
  body[data-template="gallery"] { --gutter: 20px; }
  body[data-template="gallery"] .topbar { min-height: 54px; gap: 14px; }
  body[data-template="gallery"] .topbar .brand .tagline { display: none; }
  body[data-template="gallery"] .topbar .nav { gap: 18px; }
  body[data-template="gallery"] .topbar .nav a { min-height: 54px; font-size: 11px; letter-spacing: 0.06em; }
  body[data-template="gallery"] .page { padding: 44px var(--gutter) 0; }
  body[data-template="gallery"] .page[data-route="home"] { padding: 0; }
  body[data-template="gallery"] .page[data-route="home"] > .cover { height: 60vh; min-height: 300px; }
  body[data-template="gallery"] .page[data-route="home"] > .page-title { margin-top: -44px; padding-top: 22px; font-size: clamp(28px, 8.6vw, 40px); }
  body[data-template="gallery"] .page[data-route="home"] > .page-title:first-child { margin-top: 0; padding-top: 104px; }
  body[data-template="gallery"] .page[data-route*="/"] { padding-top: 32px; }
  body[data-template="gallery"] .page[data-route*="/"] > .banner { aspect-ratio: 16 / 9; }
  body[data-template="gallery"] .grid { grid-template-columns: 1fr; gap: 34px; }
  body[data-template="gallery"] .gallery { gap: 10px; }
  body[data-template="gallery"] .row { flex-direction: column; gap: 6px; }
  body[data-template="gallery"] .row .when { flex: none; padding-top: 0; }
  body[data-template="gallery"] .stats { gap: 34px; }
  body[data-template="gallery"] .stat .num { font-size: 30px; }
  body[data-template="gallery"] .section-title { margin: 46px 0 18px; }
  body[data-template="gallery"] .head { gap: 18px; }
  body[data-template="gallery"] .head .avatar { width: 84px; height: 84px; }
  body[data-template="gallery"] .footer { padding: 28px var(--gutter) 0; }
}

@media print {
  body[data-template="gallery"] .topbar { display: none; background: none; -webkit-backdrop-filter: none; backdrop-filter: none; }
  body[data-template="gallery"] .layout { display: block; }
  body[data-template="gallery"] .main { padding: 0; }
  body[data-template="gallery"] .page,
  body[data-template="gallery"] .page[data-route*="/"],
  body[data-template="gallery"] .footer { max-width: none; padding: 0; }
  body[data-template="gallery"] .page[data-route="home"] > .cover { display: none; }
  body[data-template="gallery"] .page[data-route="home"] > .page-title,
  body[data-template="gallery"] .page[data-route="home"] > .page-title:first-child {
    margin: 0; padding: 0; background: none; font-size: 30px;
  }
  body[data-template="gallery"] .page[data-route="home"] > :not(.cover):not(.page-title) {
    max-width: none; margin-left: 0; margin-right: 0; padding-left: 0; padding-right: 0;
  }
  body[data-template="gallery"] .page[data-route*="/"] > .banner,
  body[data-template="gallery"] .page[data-route*="/"] > .entry-cover { width: 100%; margin-left: 0; }
  body[data-template="gallery"] .doc { max-width: none; }
  body[data-template="gallery"] .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  body[data-template="gallery"] .gallery { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
`

const BOOK: SiteTemplateMeta = {
  id: 'book',
  name: '书斋',
  hint: '纸书 · 侧栏',
  shell: 'sidebar',
  hero: 'banner',
  css: BOOK_CSS,
}

const ARCHIVE: SiteTemplateMeta = {
  id: 'archive',
  name: '档案',
  hint: '档案 · 编号',
  shell: 'topbar',
  hero: 'banner',
  css: ARCHIVE_CSS,
}

const GALLERY: SiteTemplateMeta = {
  id: 'gallery',
  name: '画廊',
  hint: '作品集 · 大图',
  shell: 'topbar',
  hero: 'full',
  css: GALLERY_CSS,
}

const BY_ID: Record<SiteTemplateId, SiteTemplateMeta> = {
  book: BOOK,
  archive: ARCHIVE,
  gallery: GALLERY,
}

export const SITE_TEMPLATES: readonly SiteTemplateMeta[] = [BOOK, ARCHIVE, GALLERY]

/** 未知 / 空 id 一律回落到 `DEFAULT_SITE_TEMPLATE`（存进配置的旧值不能把导出弄崩）。 */
export function siteTemplateOf(id: string | undefined): SiteTemplateMeta {
  const known = SITE_TEMPLATE_IDS.find((candidate) => candidate === id) ?? DEFAULT_SITE_TEMPLATE
  return BY_ID[known]
}
