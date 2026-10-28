/**
 * 静态展示站 · 样式表（字符串，随 HTML 内联发布）。
 *
 * 与应用同一套设计语言：令牌值直接取自 `src/app/globals.css`，极小圆角、
 * 无阴影、线只用在区块之间/表格行/浮层边界。**不依赖 Tailwind** ——
 * 导出的文件要能在任意静态托管上直接跑，不能带构建产物。
 */

export const SITE_CSS = `
:root {
  --paper: #FEFCF8;
  --paper-alt: #FAF7F2;
  --paper-card: #F3EFE9;
  --line: #E7E3DC;
  --line-hover: #D6D0C4;
  --ink: #2B2B2B;
  --ink-muted: #6E6A63;
  --ink-faint: #A5A098;
  --hover: rgba(43, 43, 43, 0.045);
  /* 导出站只有卡片与图片用圆角：对应应用里的「小」档 rounded-item（4px） */
  --radius: 4px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #1C1B1A;
    --paper-alt: #242321;
    --paper-card: #2D2B28;
    --line: #38352F;
    --line-hover: #4A4642;
    --ink: #E3DFD8;
    --ink-muted: #A5A098;
    --ink-faint: #6E6A63;
    --hover: rgba(227, 223, 216, 0.06);
  --radius: 4px;
  }
}

* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font: 14px/1.75 -apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
}
a { color: inherit; text-decoration: none; }
img { max-width: 100%; display: block; }
h1, h2, h3, h4 { font-family: Georgia, "Songti SC", "SimSun", serif; margin: 0; font-weight: 700; }
p { margin: 0 0 12px; }
hr { border: 0; border-top: 1px solid var(--line); margin: 24px 0; }

/* ── 布局 ─────────────────────────────────────────────── */
.layout { display: flex; min-height: 100vh; align-items: stretch; }
.sidebar {
  flex: 0 0 224px;
  border-right: 1px solid var(--line);
  padding: 28px 20px;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}
.brand { display: block; margin-bottom: 28px; }
.brand .world { font-family: Georgia, "Songti SC", serif; font-size: 18px; font-weight: 700; line-height: 1.35; }
.brand .tagline { font-size: 12px; color: var(--ink-muted); margin-top: 6px; }
.nav { display: flex; flex-direction: column; gap: 2px; }
.nav a {
  display: flex; align-items: center; justify-content: space-between;
  min-height: 32px; padding: 4px 8px;
  font-size: 13px; color: var(--ink-muted);
  border-left: 2px solid transparent;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.nav a:hover { background: var(--hover); color: var(--ink); }
.nav a.on { color: var(--ink); border-left-color: var(--ink); font-weight: 600; }
.nav .count { font-size: 11px; color: var(--ink-faint); font-variant-numeric: tabular-nums; }
.main { flex: 1; min-width: 0; padding: 40px 48px 80px; }
.page { max-width: 900px; margin: 0 auto; }
.footer {
  max-width: 900px; margin: 0 auto; padding-top: 32px;
  border-top: 1px solid var(--line);
  font-size: 11px; color: var(--ink-faint);
}

/* ── 页头 ─────────────────────────────────────────────── */
.page-title { font-size: 26px; line-height: 1.3; }
.page-sub { margin-top: 10px; color: var(--ink-muted); font-size: 14px; }
.section-title {
  font-family: Georgia, "Songti SC", serif;
  font-size: 15px; font-weight: 700;
  margin: 32px 0 14px;
}
/* 词条章节标题本身是入口（指向该词条的详情页） */
.section-title a { color: inherit; }
.section-title a:hover { text-decoration: underline; text-underline-offset: 3px; }
.crumb {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--ink-muted); margin-bottom: 18px;
}
.crumb:hover { color: var(--ink); }

/* ── 封面与统计 ───────────────────────────────────────── */
.cover { width: 100%; aspect-ratio: 3 / 1; object-fit: cover; background: var(--paper-card); margin-bottom: 22px; }
.stats { display: flex; flex-wrap: wrap; gap: 32px; margin: 22px 0 8px; }
.stat .num { font-family: Georgia, serif; font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; }
.stat .label { font-size: 11px; color: var(--ink-faint); letter-spacing: 0.06em; }

/* ── 卡片网格 ─────────────────────────────────────────── */
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1px; background: var(--line); border: 1px solid var(--line); }
.card { display: block; background: var(--paper); padding: 18px; border-radius: var(--radius); transition: background-color 0.15s ease; }
.card:hover { background: var(--hover); }
.card .thumb { width: 100%; aspect-ratio: 3 / 2; object-fit: cover; background: var(--paper-card); margin-bottom: 12px; border-radius: var(--radius); }
.card .name { font-family: Georgia, "Songti SC", serif; font-size: 15px; font-weight: 700; }
.card .meta { font-size: 12px; color: var(--ink-muted); margin-top: 5px; }
.card .excerpt { font-size: 12px; color: var(--ink-muted); margin-top: 8px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

/* ── 列表（时间线 / 事件 / 更新） ─────────────────────── */
.rows { border-top: 1px solid var(--line); }
.row { display: flex; gap: 16px; padding: 12px 4px; border-bottom: 1px solid var(--line); transition: background-color 0.15s ease; }
.row:hover { background: var(--hover); }
.row .when { flex: 0 0 96px; font-size: 12px; color: var(--ink-faint); font-variant-numeric: tabular-nums; padding-top: 2px; }
.row .body { flex: 1; min-width: 0; }
.row .title { font-family: Georgia, "Songti SC", serif; font-size: 15px; font-weight: 700; }
.row .note { font-size: 12px; color: var(--ink-muted); margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
/* 词条按树分章：子孙条目按 --depth 缩进（渲染时已截到四级） */
.row .body { padding-left: calc(var(--depth, 0) * 18px); }
.row.major .title::after { content: ' ★'; color: var(--ink-faint); font-size: 11px; }

/* ── 字段行 ───────────────────────────────────────────── */
.fields { border-top: 1px solid var(--line); margin: 22px 0; }
.field { display: flex; gap: 16px; padding: 9px 2px; border-bottom: 1px solid var(--line); font-size: 13px; }
.field .key { flex: 0 0 88px; color: var(--ink-faint); font-size: 12px; }
.field .val { flex: 1; min-width: 0; }

/* ── 标签 ─────────────────────────────────────────────── */
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { display: inline-flex; align-items: center; padding: 2px 8px; font-size: 11px; border: 1px solid var(--line); color: var(--ink-muted); }

/* ── 正文 ─────────────────────────────────────────────── */
.doc { font-size: 14px; line-height: 1.85; }
.doc h1, .doc h2, .doc h3, .doc h4 { margin: 22px 0 10px; line-height: 1.45; }
.doc h1 { font-size: 20px; } .doc h2 { font-size: 18px; } .doc h3 { font-size: 16px; } .doc h4 { font-size: 15px; }
.doc ul, .doc ol { padding-left: 22px; margin: 0 0 12px; }
.doc li { margin-bottom: 4px; }
.doc blockquote { margin: 0 0 12px; padding: 2px 0 2px 14px; border-left: 2px solid var(--line); color: var(--ink-muted); }
.doc pre { background: var(--paper-alt); border: 1px solid var(--line); padding: 12px 14px; overflow-x: auto; margin: 0 0 12px; }
.doc code { font-family: ui-monospace, Consolas, monospace; font-size: 12px; background: var(--paper-alt); padding: 1px 4px; }
.doc pre code { background: none; padding: 0; }
.doc img { border: 1px solid var(--line); border-radius: var(--radius); }
.doc .doc-image { margin: 16px 0; }
.doc .table-wrap { overflow-x: auto; margin: 0 0 12px; }
.doc table { border-collapse: collapse; width: 100%; font-size: 13px; }
.doc th, .doc td { border: 1px solid var(--line); padding: 7px 10px; text-align: left; vertical-align: top; }
.doc th { background: var(--paper-alt); font-weight: 600; }
.doc .task-list { list-style: none; padding-left: 2px; }
.doc li.task { display: flex; gap: 8px; }
.doc .task-box { color: var(--ink-faint); }
.doc a.ref { border-bottom: 1px solid var(--line-hover); }
.doc a.ref:hover { border-bottom-color: var(--ink); }

/* ── 人物详情 ─────────────────────────────────────────── */
.head { display: flex; gap: 22px; align-items: flex-start; margin-bottom: 8px; }
.head .avatar { width: 96px; height: 96px; object-fit: cover; border: 1px solid var(--line); background: var(--paper-card); flex: 0 0 auto; }
.head .banner { width: 100%; aspect-ratio: 3 / 1; object-fit: cover; background: var(--paper-card); margin-bottom: 22px; }
.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1px; background: var(--line); border: 1px solid var(--line); margin: 18px 0; }
.gallery figure { margin: 0; background: var(--paper); }
.gallery img { width: 100%; aspect-ratio: 3 / 2; object-fit: cover; border-radius: var(--radius); }
.gallery figcaption { font-size: 11px; color: var(--ink-faint); padding: 6px 8px; }

/* ── 关系表 ───────────────────────────────────────────── */
.rel-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.rel-table th, .rel-table td { border-bottom: 1px solid var(--line); padding: 9px 6px; text-align: left; }
.rel-table th { color: var(--ink-faint); font-weight: 500; font-size: 11px; letter-spacing: 0.05em; }

.empty { padding: 40px 0; text-align: center; color: var(--ink-faint); font-size: 13px; border: 1px solid var(--line); }

@media (max-width: 767px) {
  .layout { display: block; }
  .sidebar { position: static; height: auto; width: 100%; flex: none; border-right: 0; border-bottom: 1px solid var(--line); padding: 18px 18px 12px; }
  .nav { flex-direction: row; flex-wrap: wrap; gap: 4px; }
  .nav a { border-left: 0; border-bottom: 2px solid transparent; min-height: 36px; }
  .nav a.on { border-left-color: transparent; border-bottom-color: var(--ink); }
  .main { padding: 26px 18px 60px; }
  .head { flex-direction: column; }
}
`
