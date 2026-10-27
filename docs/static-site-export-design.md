# OC Studio 静态网站导出 · 设计方案

> 状态：**草案 v1（待评审）**
> 范围：把本地 Dexie 数据库中的创作内容，导出为可离线双击打开、也可托管到任意静态主机的「展示网站」。
> 关联：多语言（i18n）为后续既定需求，本方案必须为其预留结构，**但不能因此推迟静态导出落地**。
> 约束来源：`AGENTS.md`、`.opencode/skills/oc-studio-prd/SKILL.md`、`.opencode/skills/oc-studio-design/SKILL.md`、`.opencode/skills/oc-studio-codebase/SKILL.md`。

---

## 0. 决策速览（TL;DR）

| 编号 | 议题 | 推荐方案 | 关键理由 |
|------|------|----------|----------|
| D1 | 产物形态 | **预渲染 HTML + 渐进增强的轻量运行时** | 可离线打开、可 SEO、无框架依赖、体积可控 |
| D2 | 运行时技术 | **无框架（原生 TS + esbuild 单文件 bundle）** | 不绑定 React/Next，产物自包含 |
| D3 | 执行位置 | **纯客户端**（与产品「本地优先、无后端」一致） | 现有数据只存在于用户设备 |
| D4 | 打包 | **抽象 `ExportSink`**：浏览器=zip；Tauri/Capacitor=目录直写 | 避免大站点整块进内存 |
| D5 | 图片 | 内容哈希命名 + 去重 + 可选 WebP/多尺寸 | 缓存友好、可增量 |
| D6 | URL | `/{locale}/{type}/{id}-{slug}/` 目录形式 | 可读、稳定、file:// 可打开 |
| D7 | 数据加载 | **注入 JS 全局变量，不用 `fetch`** | `file://` 下 `fetch` 被 CORS 拦截 |
| D8 | 多语言 | **旁挂 `translations` 表 + locale 子目录站点** | 零迁移、增量、不侵入现有字段 |
| D9 | 查看器交互 | 列表/详情/相册全静态；搜索/图谱/时间线为增强岛 | 无 JS 也可读，有 JS 才炫 |
| D10 | 主题 | 复用 `globals.css` 设计令牌，独立精简 CSS | 视觉一致、无 Tailwind 运行时 |
| D11 | **观感定位** | **「纸上档案馆」设定集：纸色/留白/衬线/大图/慢节奏编辑感** | 导出物是作品的门面，好不好看是硬指标（§9） |

---

## 1. 目标与非目标

### 1.1 目标
1. **好看（第一优先）**：产物必须是一本愿意让人读完的「设定集」——纸色、留白、衬线、大图、编辑感。**好不好看是本功能的验收标准**（详见 §9）。
2. **一键导出**：在 OC Studio 内把当前数据导出为一个完整、自包含的静态网站目录/压缩包。
3. **零依赖托管**：产物上传到 GitHub Pages / Netlify / 对象存储即可访问，无需后端、无需构建。
4. **离线可用**：双击 `index.html` 用 `file://` 打开即可浏览（含图片、搜索、图谱、时间线）。
5. **可移植**：换机器、换域名不需要重新导出（使用相对路径）。
6. **内容保真**：角色、事件、国家、世界观、时间线、关系图、相册全部覆盖；富文本（TipTap）渲染为语义 HTML。
7. **无 JS 也完整**：静态 HTML 本身即可阅读且好看，JS 只做增强。
8. **多语言就绪**：数据模型与管线为「一站点多语言」预留，未来只需补编辑器与翻译录入。
9. **可增量/可校验**：产物带 manifest 与内容哈希，支持二次导出比对、资源缓存与导出后自检。

### 1.2 非目标（明确不做）
- ❌ 不做服务端渲染服务、不做后端 API。
- ❌ 不做在线编辑（导出站点是**只读**的）。
- ❌ 不导出操作日志、软删除数据、未保存草稿。
- ❌ 不做云同步（另属 roadmap）。
- ❌ v1 不做主题可视化编辑（只提供几个预设）。
- ❌ 不做增量更新（只做「可增量」的资源命名，实际全量导出）。

---

## 2. 现状盘点（设计必须踩准的事实）

### 2.1 数据层
- 唯一数据源：Dexie / IndexedDB（`src/lib/db.ts`），7 张表：`characters` / `events` / `countries` / `worldEntries` / `tags` / `operationLog` / `periods`。
- 软删除：`deleted: boolean`（`Period` 为可选）。导出必须过滤 `deleted === true`。
- 引用形式：
  - `Character.relatedCharacters: RelatedCharacter[]`（`characterId` + `name` + `relation`）
  - `Event.relations: EventRelation[]`、`Event.characters: number[]`、`Event.countries?: number[]`
  - `Country.characters/events: number[]`、`Country.parentId`
  - `WorldEntry.parentId` + `references: WorldReference[]`（`targetType` + `targetId`）
  - `tags: number[]` → `tags` 表
- 富文本两形态并存（**技术债**）：
  - `document?: unknown` — TipTap JSON
  - `content: string`（Event / World）、`bio`/`lifeStory`（Character）、`description`/`system`/`geography`/`culture`（Country）— 纯文本或旧 HTML
  - 导出侧必须实现「有 `document` 用 `document`，否则降级为纯文本转段落」的统一取值规则。
- **无 slug 字段**，无 locale 字段，无稳定公开 ID（`id` 是自增 number）。

### 2.2 图片层（三环境，最容易翻车）
| 环境 | 存储 | DB 中存的值 | 读取方式 |
|------|------|-------------|----------|
| Tauri | `$APPDATA/images/*.png` | 相对路径 `images/xxx.png` | `plugin-fs.readFile(appDataDir + path)` |
| Capacitor | `Directory.Data/images/*` | `file:///...` | `Filesystem.readFile({path})`（base64） |
| 浏览器 | 内存 blob | `blob:http://...` | `fetch(blobUrl).blob()`，**刷新即失效** |
| 通用 | — | `data:`/`http(s):` | 直接 fetch |

> ⚠️ `resolveImageUrl()`（`src/lib/image-service.ts`）返回的是**给渲染用的最终 URL**，不等于资源字节。导出层需要**另写一个** `fetchImageBlob(storedValue)`，按上表分流。浏览器 `blob:` 在导出会话内有效，所以导出必须在应用运行中完成（可接受）。

图片字段清单：`avatarUrl` / `qAvatarUrl` / `headerUrl` / `flagUrl` / `avatarUrl`(WorldEntry 无) / `gallery[].url` / `avatars[].url` / `images[].url` / `document` 内 `imageBlock.src`（**现有 `exportFullBackup` 漏掉了 document 内图片**，本方案要补上）。

### 2.3 渲染层
- TipTap 节点/标记：`paragraph` / `heading` / `text`（marks: bold/italic/underline/strike/code）/ `bulletList` / `orderedList` / `listItem` / `taskList` / `taskItem` / `blockquote` / `codeBlock` / `horizontalRule` / `hardBreak` / `table` 系列 / `details` 系列 / `mention`（`data-type=mention`, `data-id`, `data-entity-type`）/ `wikiLink`（`data-type=wiki-link`, `data-id`, `data-label`）/ `imageBlock`（自定义，`src` + `data-width`）。
- 已有 `src/lib/document-utils.ts` 只做「提取纯文本」，不足以渲染。
- 关系图 / 时间线当前是 React + `@xyflow/react` 实现，**导出产物不能复用**（会把 React 拖进产物）。

### 2.4 现有导出能力
- `src/lib/export.ts`：`exportAllData`（JSON `.ocbak`）、`exportFullBackup`（图片内联 data URI）、`exportToMarkdown` / `exportToTxt`、`downloadJson`（浏览器 `<a download>` / Capacitor `Filesystem` + Web Share）。
- `src/components/shared/ImportExportUI.tsx`：设置页「数据与同步」的导入导出入口。
- 结论：数据采集与「图片→字节」的经验已有，可复用；但**页面级静态生成是全新模块**。

### 2.5 构建与平台
- `next.config.ts`：`output: 'export'` — 应用本身是纯静态客户端应用，**没有 Node 运行时**可供导出时执行。
- Tauri capabilities（`src-tauri/capabilities/default.json`）当前 fs 权限**仅限 `$APPDATA/**`**：只能写应用数据目录，**不能写用户选择的任意目录**。这是需要改动的点（见 §11）。
- Capacitor：`@capacitor/filesystem` 可写 `Directory.Documents`，支持 `recursive: true`。
- 无 zip 库（需新增 `fflate`，约 8KB，无依赖）。

### 2.6 硬约束清单
1. 导出运行在浏览器环境，**不能依赖 Node API**（无 `fs` / `path`）。
2. 产物必须**相对路径**，且 `file://` 下可用 → **禁用 `fetch()` 加载数据**。
3. 不得把 React / Next / xyflow 打进产物。
4. 内容必须经**白名单渲染器**输出，不能拼接未转义字符串（历史上有内链 XSS 修复）。
5. 设计令牌来自 `globals.css`；禁止 `#000`/`#FFF`，遵循 `oc-studio-design`。
6. 大站点（数百页 + 上千图片）不能整块塞内存。
7. 产物需确定性（同样数据 → 同样字节，时间戳除外），便于比对与缓存。

---

## 3. 总体架构

```
┌─────────────────────── OC Studio（应用内，客户端） ───────────────────────┐
│                                                                          │
│  SiteExportDialog (UI)                                                   │
│        │ options                                                         │
│        ▼                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ 1. collect   │→ │ 2. normalize │→ │ 3. images    │→ │ 4. render    │ │
│  │ Dexie→Snapsh │  │ id/slug/link │  │ blob→hash    │  │ page→HTML    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                              │           │
│                                       ┌──────────────────────┘           │
│                                       ▼                                  │
│                              ┌──────────────┐   ┌──────────────┐        │
│                              │ 5. assets    │→  │ 6. sink      │        │
│                              │ css/js/i18n  │   │ zip / dir    │        │
│                              └──────────────┘   └──────────────┘        │
│                                                       │                  │
│                              progress / cancel / manifest / self-check   │
└───────────────────────────────────────────────────────┼──────────────────┘
                                                        ▼
                            ┌───────────────────────────────────────────┐
                            │ 产物：可离线/可托管的静态站点              │
                            │  assets/  +  {locale}/  +  manifest        │
                            └───────────────────────────────────────────┘
```

**分层原则**
- **数据访问与渲染分离**：`collect` 只产出纯数据快照（可单测），`render` 只做「快照 → 字符串」。
- **I/O 全部经 `ExportSink`**：让「写 zip」和「写目录」互换，且平台差异只在一个文件里。
- **查看器运行时是独立子项目**：有自己的源码、自己的 esbuild 构建、自己的测试；导出管线只负责「把产物字符串塞进 sink」。

---

## 4. 产物目录结构（规范）

以默认语言 `zh-CN`，另附 `en` 为例：

```
oc-site/
├── index.html                      # 默认语言首页（无跳转，利于 SEO）
├── 404.html                        # GitHub Pages 兼容
├── robots.txt
├── sitemap.xml
├── rss.xml                         # 可选：事件/词条更新流
├── oc-site.json                    # manifest（见 §6）
│
├── assets/
│   ├── site.css                    # 单一精简样式（含设计令牌 + 明暗主题）
│   ├── site.js                     # 运行时（搜索/图谱/时间线/灯箱/主题/语言）
│   ├── print.css                   # 可选
│   ├── i18n/
│   │   ├── zh-CN.json              # 查看器 UI 文案
│   │   └── en.json
│   ├── data/                       # 以 <script> 注入，不进 fetch
│   │   ├── graph.js                # window.__OC_GRAPH__
│   │   ├── timeline.js             # window.__OC_TIMELINE__
│   │   └── search.zh-CN.js         # window.__OC_SEARCH__
│   └── media/
│       ├── a1b2c3d4.webp           # 内容哈希命名，全局去重
│       └── ...
│
├── zh-CN/                          # 默认语言站点
│   ├── index.html
│   ├── characters/
│   │   ├── index.html
│   │   └── 12-renwu-ming/index.html
│   ├── events/…  countries/…
│   ├── world/index.html  world/7-…/index.html
│   ├── timeline/index.html
│   ├── relations/index.html
│   └── album/index.html
│
└── en/                             # 其他语言站点（同构）
    └── …
```

要点：
- **根 `index.html` 直接渲染默认语言**（不重定向），`/en/` 等为并列站点，用 `<link rel="alternate" hreflang>` 互相声明。
- 每个实体的 URL：`/{locale}/{type}/{id}-{slug}/index.html`。`id` 是真相锚点，`slug` 仅为可读/SEO；slug 变化不影响链接（导出时统一生成链接表）。
- **所有链接为相对路径**（同 locale 内用相对，跨 locale 用相对回根再进）。
- `assets/media/` 全局共享，多语言不重复占空间。

---

## 5. 管线详解

### 5.1 阶段 1 — 采集快照（collect）
```
SiteSnapshot {
  exportedAt, generatorVersion, schemaVersion
  options: SiteExportOptions
  data: { characters, events, countries, worldEntries, tags, periods }  // 已过滤 deleted
  settings: { defaultLocale, enabledLocales, siteTitle, siteDescription, baseUrl? }
}
```
- 复用 `exportAllData` 的过滤逻辑，但**不做 JSON 序列化**，直接产出对象图（后续阶段会改写引用）。
- 快照是不可变基线：后续所有阶段读它，确保导出期间数据变更不影响一致性。

### 5.2 阶段 2 — 归一化（normalize）
产出一个 `SiteModel`（专供渲染的中间模型），职责：
1. **ID → URL 映射**：为每个实体生成 `EntityRef { type, id, slug, paths: Record<locale, string> }`。
2. **slug 生成**：`slugify(title)`（保留中文，去标点/空白→`-`，截断 60 字符）+ 冲突时追加短哈希。
3. **引用重写**：
   - `@mention`（`data-id` + `data-entity-type`）→ 对应实体链接。
   - `[[wikiLink]]`（`data-id`，world）→ world 词条链接。
   - `relatedCharacters` / `relations` / `characters` / `events` / `parentId` / `references` → 链接或文本。
   - 目标已删除/缺失 → 降级为纯文本（不产生死链）。
4. **反向索引**：`事件↔角色↔国家↔词条` 的「被引用」列表（详情页显示「相关条目」）。
5. **排序与分组**：稳定排序（默认按 `id`，列表按名称/时间，遵循现有 `localeCompare(…, 'zh-Hans')` 习惯；多语言时按 locale 选择 collation）。

### 5.3 阶段 3 — 图片处理（images）
```
fetchImageBlob(storedValue)  // 按 §2.2 分流
  → sha256(bytes) → 前 8 字节 hex 作为文件名 media/<hash>.<ext>
  → 去重缓存 Map<hash, {fileName, width, height, mime}>
  → 可选：> 阈值则 createImageBitmap + OffscreenCanvas 缩放到 maxWidth（默认 1600）
  → 可选：导出 WebP（能力探测，失败回退原格式）
  → 返回 storedValue → media 路径 的替换表
```
- 把替换表应用到：实体字段、数组字段、以及**富文本 JSON 内的 `imageBlock.src`**（遍历 `document`）。
- 失败项（图片丢失/不可读）不阻断导出，收集为 `warnings`，并在 UI 提示「N 张图片未能导出」。
- 输出给页面的 `<img>` 默认带 `loading="lazy"` `decoding="async"`，`width`/`height`（防布局抖动）；`data-width` 存在时作为内联宽度。

### 5.4 阶段 4 — 内容渲染（render）
**TipTap JSON → 语义 HTML 白名单渲染器**（新文件 `render-document.ts`）：

| 节点 | 输出 |
|------|------|
| paragraph | `<p>`（空段落输出 `<p><br></p>`）|
| heading 1-6 | `<h1>`–`<h6>` |
| text + marks | `<strong>/<em>/<u>/<s>/<code>`，转义文本 |
| bulletList/orderedList/listItem | `<ul>/<ol>/<li>` |
| taskList/taskItem | `<ul class="task-list"><li><input type=checkbox disabled checked?>` |
| blockquote | `<blockquote>` |
| codeBlock | `<pre><code class="language-…">` |
| table 系列 | `<table><thead>/<tbody>/<tr>/<th>/<td>` |
| horizontalRule | `<hr>` |
| hardBreak | `<br>` |
| details 系列 | `<details><summary>…` |
| mention | `<a class="mention" href="{ref}">{label}</a>`（无 ref → `<span>`）|
| wikiLink | `<a class="wikilink" href="{ref}">{label}</a>` |
| imageBlock | `<figure><img src="…" width="…"></figure>` |
| **未知节点** | 递归渲染子节点，丢弃包装（向前兼容，不抛错、不输出未知 HTML）|

安全规则（硬性）：
- 只对**文本节点**做 HTML 转义（`& < > " '`）。
- 属性值（href/src/class）同样转义；`href` 仅允许相对路径或 `http(s)://`、`mailto:`，其余置空。
- **不实现**原始 `html` 节点/`innerHTML` 直通。旧 `content: string` 字段按纯文本处理：转义 + 空行分段。
- 渲染器是纯函数 + 单测覆盖（含 XSS 用例：`<img onerror>`、`javascript:` href、`<script>`）。

页面模板（`pages.ts`）产出完整 HTML：`<head>`（title/description/canonical/hreflang/OG/JSON-LD）→ 站点骨架 → 内容 → 埋数据（页面级 JSON 用 `<script type="application/json">`）。

### 5.5 阶段 5 — 资源生成（assets）
1. **`site.css`**：从设计令牌手工维护一份精简 CSS（§9）。
2. **`site.js`**：查看器运行时（§7）。
3. **`assets/i18n/{locale}.json`**：查看器 UI 文案字典。
4. **`assets/data/*.js`**：图谱/时间线/搜索索引，**以 `window.__OC_*__ = {…}` 形式注入**（避开 `file://` 的 fetch 限制）。
5. **站点级文件**：`sitemap.xml`（每 locale 全量 URL）、`robots.txt`、`rss.xml`（重大事件+最新词条）、`404.html`。

### 5.6 阶段 6 — 输出（sink）
```
interface ExportSink {
  writeFile(path: string, content: string | Uint8Array): Promise<void>
  close(): Promise<ExportResult>   // 浏览器：触发下载；Tauri/Capacitor：返回目录
}
```
| 实现 | 场景 | 行为 |
|------|------|------|
| `ZipSink` | 浏览器 | `fflate` 流式 zip，边生成边压缩，最后 `Blob` 下载 |
| `TauriDirSink` | Tauri | `dialog` 选目录（或默认 `$DOWNLOAD/OC-Studio-Site/`）→ `plugin-fs` 逐文件写 |
| `CapacitorDirSink` | Capacitor | `Filesystem.writeFile` 到 `Documents/oc-site-<date>/`，完成后 Web Share 分享 |

进度与取消：管线以 `AsyncGenerator<ExportProgress>` 形式推进，UI 订阅阶段/百分比/当前项；`cancel()` 置标志位，阶段间检查点退出并清理半成品。

---

## 6. Manifest 与数据契约

`oc-site.json`：
```jsonc
{
  "kind": "oc-studio-site",
  "schemaVersion": 1,            // 产物结构版本（查看器据此兼容）
  "generatorVersion": "0.19.0-alpha",
  "exportedAt": "2026-09-23T00:00:00.000Z",
  "datasetHash": "sha256:…",     // 归一化模型的哈希 → 判断“是否变化”
  "defaultLocale": "zh-CN",
  "locales": ["zh-CN", "en"],
  "site": { "title": "…", "description": "…", "baseUrl": null },
  "features": { "search": true, "graph": true, "timeline": true, "rss": true },
  "counts": { "characters": 0, "events": 0, "countries": 0, "worldEntries": 0, "media": 0 },
  "warnings": [{ "code": "IMAGE_UNRESOLVED", "ref": "characters/12/avatarUrl" }]
}
```
契约规则：
- **只增不改**：`schemaVersion` 递增仅在破坏性变更时；查看器必须容忍**高于自己**的次版本（忽略未知键）。
- 查看器与产物**同批导出**，天然版本一致；manifest 主要服务于「二次导入/校验/增量」和调试。
- `datasetHash` 也写进每页 `<meta name="oc-dataset">`，便于「这个站点是哪次导出的」。

---

## 7. 查看器运行时设计（产物内）

### 7.1 技术选型
- 源码：`src/features/site-export/viewer/*.ts`，纯 TS，**零运行时依赖**。
- 构建：`npm run build:viewer` → esbuild → IIFE 单文件 → 生成 `viewer-dist/site.js.ts`（`export const SITE_JS = \`…\``）、`viewer-dist/site.css.ts`。
  - 为什么生成 TS 字符串模块：Next/Turbopack 下 `?raw` 导入行为不稳定，生成字符串模块**不改打包配置**、Tauri/Capacitor 也一致。
- 产物在页面末尾 `<script src="…/assets/site.js" defer>`；CSS 用 `<link>`。

### 7.2 页面类型
| 页面 | 内容 | 是否需要 JS |
|------|------|-------------|
| 首页 | 站点标题/简介 + 各模块入口 + 最近更新 | 否 |
| 角色/事件/国家/词条 列表 | 卡片网格；标签/分类筛选（纯 CSS `:has` 或 JS 增强） | 否（筛选增强） |
| 实体详情 | 头图/头像 + 属性表 + 富文本正文 + 相册 + 相关条目 | 否（灯箱/折叠增强） |
| 词条目录 | 树形侧栏（静态展开）+ 正文 | 否 |
| 时间线 | 静态 SVG 条形图（导出时按比例生成） | 是（缩放/筛选/拖拽） |
| 关系图 | 静态节点/边列表 + 预布局 SVG | 是（力导向/悬停高亮） |
| 相册 | 图片网格 | 是（灯箱） |
| 搜索 | `/search/index.html` + 索引 | 是 |

> **无 JS 降级是原则**：图谱/时间线在导出时生成**预布局 SVG + 可访问列表**，JS 只负责交互增强。

### 7.3 交互岛
- **搜索**：读 `window.__OC_SEARCH__`（`[{t,u,s,c}]`），输入过滤 + 高亮 + 键盘导航；数据量大时预分片（P2）。
- **图谱**：自研轻量力导向（~150 行），Canvas/SVG 渲染；导出时先用确定性布局算好初始坐标存进 `graph.js`，避免每次打开跳动。
- **时间线**：静态 SVG 打底，JS 增强缩放/横向滚动/筛选，与 `TimelineView` 的观感对齐但代码不复用。
- **灯箱**：原生 `<dialog>` + 键盘/手势。
- **主题**：读取 `prefers-color-scheme`，提供明/暗/跟随切换，写 `localStorage`。
- **语言切换**：跨 locale 跳转（读取当前路径的 locale 段，替换后跳转；维护 `hreflang` 关系）。

### 7.4 确定性布局
关系图/时间线的初始坐标必须由**固定种子的布局算法**在导出时算好并写入数据文件——保证「同数据 → 同产物」，也让首屏不闪。

---

## 8. 多语言（i18n）设计 ★

这是本方案需要重点预留的部分。必须区分两类多语言，二者技术难度差一个量级。

### 8.1 两类多语言

**A. 查看器 UI 语言（chrome）** — 简单
- 内容：导航标签、按钮、字段名（「别名」「国籍」「身高」）、空状态、搜索占位等。
- 方案：`assets/i18n/{locale}.json` 字典 + `t(key)`；页面生成时**按 locale 直接渲染对应文案**（不靠 JS 换字），所以无 JS 也是正确语言。
- 现状：全站中文硬编码，字典需从组件中抽取（**可增量，只抽导出站点用到的**，不要求全应用 i18n 化）。

**B. 创作内容语言（content）** — 核心难点
- 内容：角色名/别名/简介/生平、事件标题/摘要/正文、国家名/描述/体制/地理/文化、词条标题/正文、时期名。
- 需要一套能承载「同一实体的同一字段存在多语言版本」的数据模型。

### 8.2 内容本地化数据模型（推荐：旁挂 translations 表）

```ts
// DB v6 新增表（纯新增，不改现有字段 → 零迁移风险）
interface Translation {
  id?: number
  entityType: 'character' | 'event' | 'country' | 'world' | 'period' | 'site'
  entityId: number            // site 级用 0
  field: string               // 'name' | 'bio' | 'document' | 'summary' | …
  locale: string              // 'en' | 'ja' | …
  value: string               // 纯文本字段
  document?: unknown          // 富文本字段的 TipTap JSON
  updatedAt: number
  _syncStatus?: string
  _lastModified?: number
}
// 复合索引：entityType+entityId / locale
```

为什么选它：
- **零侵入**：不动 `Character` 等接口，现有查询/编辑器/导入导出全部照旧。
- **增量**：只翻译想翻译的字段；未翻译 → 回退默认语言（`resolveField(entity, field, locale)`）。
- **对称导入导出**：现有 `.ocbak` 加一个可选 `translations` 数组即可（向后兼容，同 `periods` 的加法方式）。
- **不锁死**：将来若要改成字段内嵌 `{locale: value}`，可用同一份数据迁移。

配套（最小）：
- `Settings` 增 `defaultLocale: string`、`enabledLocales: string[]`、`localeLabels`。
- 各编辑器加「语言切换」下拉（仅当 `enabledLocales.length > 1` 时出现），UI 与当前数据模型解耦。
- `resolveField` / `resolveDocument` 工具函数放 `src/lib/i18n/`，导出与应用内预览共用。

### 8.3 导出多语言策略
- **一站点多 locale 子目录**（`/zh-CN/`、`/en/`），根为默认语言。理由：SEO（hreflang）、可分享单语言链接、无 JS 可用。
- 每个 locale 生成**完整独立页面**（非运行时换字），因此无 JS 也正确。
- 共享 `assets/`（CSS/JS/media）；语言相关的数据文件按 locale 分开（`search.en.js`、i18n/en.json）。
- 缺失翻译：回退默认语言值，并在页面 `<html>` 上标注该页混合语言（可选提示「此条目暂无英文」）。
- 应用内可从已有 AI 能力（`chatCompletion`）提供**「AI 辅助翻译」**按钮——注意：这是「秘书」定位的边缘，需用户明确点击，且**不自动写入**，仅生成候选供确认。列为 P2。

### 8.4 与现有代码的接口
```
SiteExportOptions.locales: string[]        // 勾选要导出的语言
resolveField(entity, field, locale)        // 回退默认语言
resolveDocument(entity, locale)            // 富文本同理
buildI18nDict(locale)                      // 查看器 UI 字典
```
导出管线**不感知**翻译的来源（手工/AI/导入），只读 `resolve*`。

---

## 9. 视觉设计（产物观感）★

> **导出的不是「数据存档」，而是一本可翻阅的设定集。**
> 技术只负责无损送达；能不能让人愿意读完，看这一章。
> 所有同学注意：本功能的验收标准包含「截图好不好看」，不是只有「链接能不能点」。
>
> 📐 **视觉样张已产出**：`docs/prototype/`（`index.html` 首页 + `character.html` 角色详情 + `site.css` + `site.js`）。
> 用浏览器直接打开 `index.html` 即可查看最终观感——包含明暗主题切换、无头图降级、目录高亮。**后续模板实现以样张为准。**

### 9.1 艺术方向：纸上档案馆 / The Quiet Archive
**关键词**：纸、留白、衬线、大图、慢、编辑感（editorial）。
**气质参考**：美术馆图录、人物志、旧地图册、独立出版物的排版。
**坚决不要**：后台仪表盘感、成串的实心卡片、渐变紫蓝、emoji 装饰、满屏描边、阴影堆叠、自动轮播。

三条铁律：
1. **留白即设计** — 正文最大宽度 ~70ch，两侧留白充足；段落呼吸感优先于信息密度。
2. **衬线做标题，无衬线做正文** — 标题 `--font-serif`（Noto Serif SC / Lora），正文系统 sans，行高 1.75。
3. **界面无色，内容有色** — 页面框架只用纸张与墨色令牌；允许出现的颜色只来自内容本身（头图、立绘、时期色带、标签色）。

### 9.2 版式系统（流体排版）
| 层级 | 字体 | 尺寸（fluid） | 其他 |
|------|------|---------------|------|
| Display（首页 hero） | serif 700 | `clamp(2.5rem, 6vw, 4.75rem)` | line-height 1.08，letter-spacing -0.02em |
| H1 页面标题 | serif 700 | `clamp(1.75rem, 3.5vw, 2.5rem)` | 详情页压在头图上 |
| H2 章节 | serif 600 | `clamp(1.25rem, 2vw, 1.5rem)` | 上间距 ≥ 2.5em |
| H3 小节 | sans 600 | 1.125rem | |
| 正文 | sans 400 | 1.0625rem / 1.75 | max-width 70ch |
| 摘要/引子 | serif 400 italic | 1.25rem | ink-muted |
| Meta/Caption | sans 400 | 0.8125rem | ink-faint，letter-spacing 0.02em，tabular-nums |
| 大字标（首页统计/年份） | serif | `clamp(2rem,4vw,3rem)` | tabular-nums，ink-faint |

### 9.3 逐页构图
**首页**
```
┌──────────────────────────────────────────────┐
│  头图（3:2，cover，底部墨色渐变）              │
│      站点标题（Display）                       │
│      一句话引子（serif italic）                │
├──────────────────────────────────────────────┤
│  主要角色 —— 3:4 立绘大卡横排（可横滑）        │
│  近期事件 —— 竖向时间流（年份大字 + 细线）     │
│  世界观入口 —— 词条分类块                      │
│  页脚（极简，一行）                            │
└──────────────────────────────────────────────┘
```
- 无头图时 hero 自动降级为**纯文字版**（大字标题 + 细分割线），绝不出现破图或空占位。

**实体详情**（角色/事件/国家/词条通用骨架）
```
┌─ 3:2 头图 banner ────────────────────────────┐
│  渐变遮罩 + 衬线大标题 + 一行副标题（类型/时间）│
├───────────────────────────┬──────────────────┤
│  正文（TipTap 渲染，70ch） │  sticky 侧栏：    │
│  · 段落/标题/表格/引用     │   · 属性表        │
│  · 相册瀑布流              │   · 标签          │
│  · 相关条目卡              │   · 本页目录 TOC  │
│                            │   · 相关条目链接  │
└───────────────────────────┴──────────────────┘
```
- 属性表：两列，`key` ink-faint / `value` ink，行间 1px `line` 细分隔线，**不用卡片包裹**。
- 长文自动生成 **TOC**（h2/h3），滚动高亮当前节（`IntersectionObserver`，无 JS 时仍是可跳转锚点）。

**列表页**
- 拒绝密集网格。用两种「人物志」版式：
  - **画廊版**：3:4 立绘大卡，图下衬线姓名 + 一行身份，间距 24–32px。
  - **目录版**：编辑式行（序号 01/02 + 衬线名称 + 一行摘要 + 右侧小缩略图），行间 1px 细线。
- 排序/筛选控件做成极简下拉，视觉重量 < 内容。

**词条（世界观）**
- 左侧 240px 静态目录树（细线缩进、当前项 `ink` 加粗），右侧正文；窄屏折叠为顶部折叠导航。

**时间线**
- 横向长卷：顶部时期色带（复用 `PERIOD_COLORS`，2–4px 高色条），下方事件矩形条，1px `line` 基线，重大事件用衬线标签 + 墨色标记点；横向滚动带细滚动条。

**关系图**
- 节点：角色=圆、事件=圆角方、国家=方（与工作台语义一致）；白底、1px `line-hover` 边、4–8px；连线 1px `ink-muted`；hover 高亮邻居、其余淡化到 30% 不透明度；无箭头或仅 1px 细箭头。

**相册**
- CSS `columns` 瀑布流（列宽 260px 自适应），图片 `aspect-ratio` 保留原比，caption 用衬线斜体居中；点击进灯箱。

**搜索**
- 极简：一个下划线式输入框 + 结果列表；命中词用**下划线**高亮而非黄底。

### 9.4 图像处理规范
| 场景 | 比例 | 处理 |
|------|------|------|
| 详情页头图 | 3:2 | `aspect-ratio` + `object-fit: cover`，叠底部渐变 `linear-gradient(transparent, rgba(28,27,26,.55))`（**不是纯黑**）保证白字可读 |
| 首页 hero | 21:9（宽屏）/ 3:2（窄屏） | 同上，遮罩更深一档 |
| 立绘 gallery | 3:4 | `object-fit: contain`，纸色底，**不加投影**（本项目无阴影语言） |
| 头像 / 徽记 | 1:1 | 圆形（唯一允许全圆角），1px `line` 描边 |
| 正文内嵌图 | 原始比例 | 居中，最大宽 100%，caption 可选 |

- 全部 `loading="lazy"` `decoding="async"` + 显式 `width/height` 防抖。
- `alt` 取 caption，无 caption 则取实体名 + 序号。
- 图片缺失时输出 1:1 纸色占位块（不输出破图图标）。

### 9.5 动效
- **允许**（全部 ≤ 0.4s、ease-out、一次性）：首屏内容淡入上移 8px；图片 hover `scale(1.02)`；链接下划线展开；灯箱淡入；图谱 hover 高亮过渡；时间线惯性滚动。
- **禁止**：弹跳、循环动画、视差大位移、自动轮播、粒子/彩带、滚动劫持。
- `prefers-reduced-motion: reduce` → 全部动效关闭（含过渡）。
- 渐进增强：详情页跳转可用 **View Transitions API**，不支持则普通跳转（不报错、不降级出 bug）。

### 9.6 主题与强调色
- 默认「纸白」（`--oc-paper` 系），提供「暗夜」（`.dark`），可跟随系统；首页 head 内联脚本防闪烁（复用 `layout.tsx` 手法）。
- 强调色预设三选一，**仅影响链接下划线、hover、当前项标记等细节**，绝不改背景：`墨黑`（默认，无色）/ `赭石` / `黛青`。
- 主页签名可选：是否显示「由 OC Studio 生成」。

### 9.7 响应式
- 断点 640 / 1024 / 1280。移动端单栏；详情页 sticky 侧栏移到正文之后；属性表转两列。
- 触控目标 ≥ 44px；移动端正文不小于 16px；时间线/图谱在窄屏提供「列表视图」替代（可访问性）。

### 9.8 无 JS 也必须好看
静态 HTML 在 JS 执行前就必须完整、正确、好看：图片、标题、正文、属性表、相关条目、TOC 全部就位；JS 只增加灯箱、搜索、图谱交互、主题与语言切换。
**验收方式**：禁用 JS 打开 `index.html`，随机抽 3 个页面截图评审。

### 9.9 视觉验收清单（导出前人工过一遍）
- [ ] 1440 / 768 / 390 三档宽度截图检查
- [ ] 明、暗两主题各看一遍
- [ ] 无头图实体的详情页不塌、不出现破图
- [ ] 长文详情：正文行宽 ≤ 70ch、TOC 可跳转
- [ ] 图片无拉伸、比例正确、无错位
- [ ] 未翻译条目回退时标题/正文不为空
- [ ] 全站无 `#000` / `#FFF`，只用令牌色
- [ ] `reduced-motion` 下无动画
- [ ] 移动端：单栏流畅、触控目标够大、无横向溢出

### 9.10 实现落点
- `viewer/styles/site.css`（约 600–900 行，手写、分区块注释，禁用 CSS 框架）。
- 页面结构由 `pages.ts` 生成，**模板内不写行内样式**（图片宽度等数据驱动值除外）。
- 技术手段：`clamp()` / `aspect-ratio` / `grid` / `container queries` / `:has()`，全部现代浏览器基线（与项目 Chromium 兼容策略一致）。

### 9.11 设计令牌复用
- 查看器**不引入 Tailwind 构建产物**。`site.css` 顶部集中一段 `--oc-*` 令牌，与 `src/app/globals.css` 保持同值。
- **单一来源仍指回 `globals.css`**：不做构建期自动提取（避免耦合），改为手动同步 + 纳入 PR 检查清单（「改了 globals.css 令牌 → 同步 site.css」）。
- 明暗走 `[data-theme="dark"]` 与 `prefers-color-scheme` 双路径。

---

## 10. 平台适配与保存

| 平台 | 流程 | 需要的改动 |
|------|------|------------|
| 浏览器 | 生成 zip → `<a download>` | 新增 `fflate` 依赖 |
| Tauri | `dialog.open({directory:true})` 选目录 → `plugin-fs` 写入 → 可选「在文件管理器中显示」 | **capabilities 需扩展可写路径**（当前仅 `$APPDATA/**`）。推荐新增 `$DOWNLOAD/**`、`$DOCUMENT/**` 写权限，默认导出到 `$DOWNLOAD/OC-Studio-Site/<name>/`；用户选目录若越界需 Rust 侧 `allow_directory` 动态授权（P2，v1 可先固定到 DOWNLOAD） |
| Capacitor | `Filesystem.writeFile(Directory.Documents, recursive)` → `navigator.share` 分享 | 无（现有依赖足够） |

交互细节：
- 导出中显示阶段 + 计数（`正在处理图片 123/456`），**可取消**。
- 完成后显示：输出路径/文件名、大小、条目数、警告数；提供「打开文件夹」（Tauri）「复制路径」「再导一次」。
- 空数据/单条数据需有友好提示；导出失败保留原因（内存不足要单独提示，建议改选「不含图片」）。

---

## 11. 性能与体积

- **图片是体积大头**：内容哈希去重 + 缩放到 `maxWidth`（默认 1600）+ 可选 WebP，通常能降 60%+。默认质量档：`原图 / 均衡（推荐）/ 最小`。
- **HTML 页数膨胀**：数百页 × 每页几 KB，正常；不内联大 JSON（数据走共享 assets）。
- **内存**：浏览器用流式 zip；Tauri/Capacitor 逐文件写，峰值内存 ≈ 单张图片。
- **图片转换并发**：`createImageBitmap` 并发上限（如 4），避免移动端 OOM；可用 OffscreenCanvas + Worker（P2）。
- **首屏**：`site.js` defer + 数据文件仅在使用页加载（首页只加载必要数据）。
- **可缓存**：media 内容哈希 → 永久缓存头；`site.css/js` 带内容哈希文件名（P2）。

---

## 12. 安全

| 风险 | 对策 |
|------|------|
| 内容 XSS（富文本/旧 HTML 字段） | 白名单渲染器 + 全量转义；`href` 协议白名单；禁止原始 HTML 直通（§5.4）|
| 产物外链泄漏隐私 | 导出不含任何远程请求（系统字体、无 CDN）；可选 CSP `<meta>` |
| 图片路径穿越 | 哈希命名，不使用用户提供的文件名 |
| 敏感字段 | 不导出 `operationLog`；`_syncStatus`/`_lastModified` 从产物中剥离 |
| `file://` 限制 | 数据用 `<script>` 注入而非 `fetch`（§5.5）|
| 站点被搜索引擎收录 | 提供「生成 robots.txt / noindex」开关（本地预览时用）|

---

## 13. 应用内 UX（导出向导）

入口：设置 →「数据与同步」新增「导出为静态网站」区块（与现有导入/导出并列）；也可后续加命令面板项。

向导（单页表单 + 进度态，不必多步）：
1. **站点信息**：标题、简介、页脚（默认取项目名）。
2. **语言**：默认语言（必选）、附带语言（多选；未启用多语言时隐藏）。
3. **内容范围**：模块勾选（角色/事件/国家/世界观/时间线/关系图/相册）+（可选）按标签筛选。
4. **图片**：包含图片（开/关）、质量档、最大宽度、是否转 WebP。
5. **外观**：明/暗/跟随；是否显示「由 OC Studio 生成」页脚。
6. **输出**：目标位置（浏览器=下载；Tauri=选目录；Capacitor=Documents）+ 是否打包 zip。
7. **开始导出** → 进度条（阶段名 + `n/m`）→ 结果卡片。

预览（P2）：导出后在临时 blob URL 打开 `index.html` 预览（`file://` 限制下用 `URL.createObjectURL` 无法跨相对路径，故预览需走「先落盘再打开」或内嵌 iframe + data URI 的子集预览——列为 P2，需再验证）。

---

## 14. 导出后自检（Validation）

管线末尾跑一遍轻量检查，结果写进 manifest.warnings 并在 UI 展示：
- 所有内部链接的目标文件存在（构建期已知的文件表内比对）。
- 产物内**不出现** `blob:` / `file://` / `http://localhost` / 绝对路径 `/assets` / `app://`。
- 每张引用的 media 文件都已写出，反之无孤儿文件。
- 每个 locale 的必需页面齐全。
- `img` 都有 `src`，`a` 都有 `href`。
- 产物中不出现 `_syncStatus` / `operationLog` 等内部字段。

---

## 15. 需要新增/修改的文件清单

**新增**
```
docs/static-site-export-design.md            ← 本文档
docs/prototype/                              ← 视觉样张（已产出，模板实现以此为基准）
  index.html  character.html  site.css  site.js
src/features/site-export/
  index.ts                                   # barrel
  types.ts                                   # SiteExportOptions / SiteSnapshot / SiteModel / Progress / Warnings
  services/
    collect.ts                               # 阶段1
    normalize.ts                             # 阶段2（id/slug/link/backrefs）
    images.ts                                # 阶段3（fetchImageBlob/hash/convert/dedupe）
    render-document.ts                       # TipTap JSON → HTML（白名单）
    pages.ts                                 # 阶段4 页面模板
    assets.ts                                # 阶段5 css/js/i18n/data/sitemap/rss
    sink.ts                                  # 阶段6 ExportSink 三实现
    pipeline.ts                              # 编排 + 进度 + 取消 + manifest + 自检
  hooks/useSiteExport.ts
  components/SiteExportDialog.tsx
  viewer/                                    # 独立运行时源码
    site.ts graph.ts timeline.ts search.ts lightbox.ts theme.ts lang.ts
    styles/site.css
  viewer-dist/                               # esbuild 产物（生成的 TS 字符串模块）
  __tests__/render-document.test.ts normalize.test.ts
src/lib/i18n/
  resolve.ts                                 # resolveField / resolveDocument
  locales.ts                                 # 默认语言列表
```

**修改**
```
src/lib/db.ts                     # v6：新增 translations 表（纯新增）
src/types/index.ts                # 新增 Translation 接口
src/lib/export.ts / import.ts     # .ocbak 增加可选 translations 字段
src/lib/settings.tsx              # defaultLocale / enabledLocales / site 偏好
src/components/shared/ImportExportUI.tsx  # 入口接线
src-tauri/capabilities/default.json       # fs 写权限扩展（§10）
package.json                      # + fflate；+ build:viewer 脚本；+ esbuild(dev)
scripts/build-viewer.mjs          # esbuild 打包 + 生成 viewer-dist/*.ts
```

---

## 16. 分阶段路线图

### P0 — 视觉定稿 + 最小可用静态站（不含图片、单语言）
- **0. 先出视觉样张**：手写 2 个静态 HTML 样张（首页 + 角色详情），定稿版式、字体比例、色彩、无头图降级。**样张评审通过后**再写模板 —— 避免"先把结构写死、再回头改好看"。
- `collect → normalize → render-document → pages → ZipSink` 全链路打通。
- 页面：首页 + 角色/事件/国家/词条 列表与详情 + 相册（无灯箱）。
- `site.css` + head 内联主题脚本；`sitemap.xml`。
- 产物可 `file://` 打开、可上传托管。
- ✅ 内容验收：随机抽 3 个实体比对内容；双击 `index.html` 全站可点无死链。
- ✅ **视觉验收**：过一遍 §9.9 清单；1440/768/390 三档 + 明暗两主题截图评审通过。

### P1 — 图片 + 完整模块 + 观感打磨
- `images.ts` 全流程（三环境读取、哈希去重、缩放、WebP、document 内图片）。
- 头图 banner / 立绘画廊 / 相册瀑布流 + 灯箱 / 属性表 / TOC / 相关条目 —— 按 §9.3–9.4 实现。
- 时间线（静态 SVG + JS 增强）、关系图（预布局 + 力导向）、标签筛选。
- Tauri/Capacitor sink；进度/取消/结果卡片；导出后自检。
- ✅ 功能验收：Tauri 导出到目录、Android 导出到 Documents 并分享，图片全部可显示。
- ✅ **视觉验收**：图片比例无拉伸、渐变遮罩文字可读、hover 动效不越界（§9.5）、移动端无横向溢出。

### P2 — 多语言
- `translations` 表 + 编辑器语言切换 + `resolveField`。
- 多 locale 子目录站点、查看器语言切换、hreflang、i18n 字典抽取。
- AI 辅助翻译候选（可选，用户确认后写入）。
- ✅ 验收：`zh-CN` + `en` 双站点，未翻译字段正确回退，无 JS 也可切换语言入口。

### P3 — 打磨
- 搜索索引分片 / 全文检索；`site.css/js` 内容哈希缓存；RSS；`robots.txt` 开关。
- 导出预设（保存/复用配置）；`datasetHash` 增量比对提示；预览。
- 性能：Worker 图片处理、并发上限自适应。

---

## 17. 风险与开放问题

### 风险
| 风险 | 影响 | 缓解 |
|------|------|------|
| 图片体积/内存（大量立绘） | 导出失败、移动端 OOM | 质量档 + 并发上限 + 逐文件写；支持「不含图片」 |
| 浏览器 `blob:` 图片生命周期 | 刷新后无法导出 | 导出须在会话内；文档中明确 |
| Tauri 权限模型 | 无法写任意目录 | v1 固定 `$DOWNLOAD`；P2 做动态授权 |
| 自研图谱/时间线 | 工作量与观感风险 | 先静态 SVG，交互逐步加；不追求与工作台 1:1 |
| **审美不达标** | 导出物是作品门面，不好看等于白做 | P0 先出静态样张评审；§9.9 作为硬验收清单；**宁可少一个功能，也要好看** |
| 设计令牌双份维护 | 视觉漂移 | `site.css` 令牌集中一段 + PR 检查清单 |
| 富文本形态不统一（`document` vs `content`） | 渲染分支多 | 本方案正好推动单格式收敛（对齐 `todo.md`） |
| 多语言拖慢导出落地 | 优先级被稀释 | 明确 P0/P1 单语言先行，i18n 仅预留接口 |

### 待你拍板
1. **产物形态**：确认走「预渲染 HTML + 轻量运行时」，还是你更想要「数据 + 预置 SPA 查看器」（体积更小、SEO 差）？
2. **技术栈**：查看器用**原生 TS**（推荐）还是复用 React（产物大、但图谱/时间线可复用现有代码）？
3. **图片默认档**：默认「均衡（maxWidth 1600 + WebP）」是否可接受？原图导出作为备选。
4. **多语言范围**：`enabledLocales` 首批要支持哪些语言？是否需要 RTL（阿拉伯语/希伯来语）——这会显著影响 CSS 方案。
5. **URL/slug**：接受 `/{locale}/{type}/{id}-{slug}/` 吗？是否需要自定义域名/子路径部署（影响 `basePath` 处理）。
6. **是否要 RSS / 404.html / robots.txt**：默认全开是否合适。
7. **Tauri 输出位置**：v1 固定 `$DOWNLOAD/OC-Studio-Site/` 可接受吗？
8. **翻译录入**：首批是否要 AI 辅助翻译入口，还是纯手工？

---

## 18. 附：与现有代码的对应关系

| 需求 | 复用/参考 | 说明 |
|------|-----------|------|
| 过滤软删除、取全量数据 | `src/lib/export.ts: exportAllData` | 复用过滤规则，产出对象而非 JSON |
| 三环境图片读取 | `src/lib/image-service.ts` + `adapters/*` | **不能直接用 `resolveImageUrl`**，另写 `fetchImageBlob` |
| 浏览器/Capacitor 下载 | `src/lib/export.ts: downloadJson/Capacitor` | 参考分支写法；zip 走 fflate |
| 富文本 JSON | `Event/Country/World/Character.document` | 白名单渲染器新写；`document-utils.ts` 仅参考 |
| 关系数据 | `src/features/relations/services.ts` | 图谱数据来源 |
| 时间线/时期 | `TimelineView` + `periods` 表 | 仅取数据，不取代码 |
| 标签 | `src/features/tags/services.ts` | 列表筛选 |
| 设计令牌 | `src/app/globals.css` | 复制到 `site.css` |
| 入口 UI | `ImportExportUI.tsx` | 同区域新增区块 |
| 文档规范 | `todo.md` / PRD「展示网站导出」 | 落地后需更新 PRD 进度与 todo |
