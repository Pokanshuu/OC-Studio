<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# OC Studio

**v0.20.3-beta** — 本地优先的原创角色（OC）与世界观创作工作台。

## 项目身份
- Next.js 16 (App Router) + TypeScript strict + Tailwind CSS v4 + shadcn/ui
- Dexie.js (IndexedDB) 本地数据库，Tauri v2 桌面打包，Capacitor v8 移动端封装
- TipTap (ProseMirror) 富文本编辑器，@xyflow/react 关系图谱
- 图标：lucide-react，图标库禁止使用非 lucide 的图标

## 关键文件路径

### 数据库
- `src/lib/db.ts` — Dexie 4，schema **v6**，**8 张表**（characters, events, countries, worldEntries, tags, operationLog, periods, meta）。表类型为 `EntityTable<T,'id'>`：**读出的行 `id` 必为 number，写入时 `id` 可省**（新增表照此声明）
- `src/types/index.ts` — 全局类型定义（实体 `id: number` 必填、`Period` + `PERIOD_COLORS`、`ProjectMeta`）
- `src/lib/sync.ts` — 操作日志 (`logOperation`) + 待同步时间戳 (`pendingStamp`)
- `src/lib/repository.ts` — 泛型 CRUD 仓储原语（listActive / getById / softDelete）。签名是 `Table<T, number, TInsert>`，**第 3 个泛型位不可省**（否则推断会把行类型统一成写入类型，见 §已知差异）
- `src/lib/membership.ts` — **成员关系的单向应用**（阶段二·一之后，镜像已拆）：真源只有实体侧 —— 角色 `countryId`（国籍）、事件 `countries`（相关国家）。国家页的「相关角色 / 相关事件」**不是存储**，是查询（`features/countries/services.ts` 的 `listCountryCharacters` / `listCountryEvents`）。这里只剩 `applyCountryCharacters` / `applyCountryEvents`（国家编辑器的名单 → 写实体侧）与 `purgeCharacterReferences` / `purgeCountryReferences`（软删除清引用）。盘上遗留的 `country.characters` / `country.events` **不读、不写、不删**：`COUNTRY_KEYS` 里没有这两个键，`Country` 类型里也**已经没有这两个字段**（阶段二·一收尾）—— 留着字段就会有人再去读它。**不要再引入第二份名单**。国籍的显示/分组/筛选统一走 `resolveCharacterCountryId`（id 优先，只剩旧 `国籍:` 文本时按国家名回落）；清空归属时**连旧文本一起清**，否则回落逻辑会让「改成未归属」下一次又变回去
- **删除后的残留分两类，别混为一谈**（2026-11-11 逐项核过）：**成员关系**（角色的 `relatedCharacters`、事件的 `participants`、国家的国籍/相关国家、地图的 `mapId`）在软删除时**主动清掉**（`purge*References` / `deleteMap` 里的事务）；**命名关系**（笔记的 `relations`、角色的 `relatedNotes`、事件的 `relations`）**故意保留名字**——目标被删或改名时那一行仍然显示原文、只是不可点（`RelationName` 在 `targetId === undefined` 时渲染成纯文本）。想「统一」成全都清掉之前先想清楚：命名边是用户写下的语义，删了不可恢复
- `src/lib/env.ts` — 环境检测唯一权威（isTauri / isCapacitor / isNativePlatform）
- `src/lib/version.ts` — 版本号单源（读 package.json）
- `src/lib/open-external.ts` — 用系统浏览器打开外链（桌面走自建命令 `open_external`，见 `src-tauri/src/open.rs`；浏览器/Capacitor 走 `window.open`）。**Tauri 里 `target="_blank"` 是死的**，别再直接写 `<a>`
- `src/lib/tag-colors.ts` — 标签预设色板唯一源（`pickTagColor` / `normalizeTagColor`；`TagBadge` 按色值映射到**完整字面量**类名，Tailwind JIT 不能拼接）
- `src/lib/image-refs.ts` — **图片引用收集唯一源**（`collectBodyImageRefs` / `collect{Character,Event,Country,WorldEntry}ImageRefs` / `inlineBodyImageRefs`）。相册（`useAlbumData`）、`.ocbak` 备份（`export/payload`）、老数据落地（`vault/export-dir`）三处共用；字段图（头像/立绘/封面/图集/旗帜）**和正文 `imageBlock`** 都算，词条的正文统一走 `lib/world-body.ts`（`worldBodyOf`），别再在任何一处手写遍历
- `src/components/layout/BlurEffect.tsx` — 窗口模糊（Mica / vibrancy）唯一入口，挂在 `VaultGate` **外面**：欢迎页会替代 `AppShell` 渲染，效果写在 AppShell 里首屏就永远拿不到

### 界面（设计令牌唯一源）
- `src/lib/ui-tokens.ts` — **界面原子类唯一源**，改 UI 时从这里取，不要就地拼写。分八组：标题（PAGE_TITLE / SECTION_TITLE）· 页头（TOOLBAR / EDITOR_HEADER / EDITOR_BODY）· 按钮（BTN_PRIMARY / BTN_QUIET / **BTN_DANGER**（灰调红实心，破坏性确认唯一形态）/ ICON_BTN / ICON_BTN_MD / FILTER_TRIGGER）· 输入与字段行（INPUT_LINE / TITLE_INPUT / FIELD_INPUT / **DATE_INPUT**（年/月/日 三段）/ FIELD_ROW / FIELD_LABEL / FIELD_GRID / LIST_END / SEARCH_INPUT / SEARCH_ICON）· 浮层（PANEL / MENU / MENU_ITEM_BASE / MENU_ITEM / MENU_GROUP_LABEL）· 列表（LIST_GRID / ROW_ACTIONS / EMPTY_HINT / MOBILE_FILTER_BTN / CHIP）· 素材卡与节点（MEDIA_CARD / MEDIA_IMG / MEDIA_GRADIENT / MEDIA_FALLBACK / NODE_WRAPPER）· 圆角与空态（ROUND_ITEM / ROUND_CONTROL / ROUND_PANEL、EMPTY_STATE / CENTER_STATE / LOADING_TEXT）
- `src/app/globals.css` — 设计令牌（`--oc-paper/ink/line/line-soft/hover`、`--oc-danger`（危险按钮的灰调红底色）；`line-soft` = 线的半透明版，压在模糊 / 背景图上时用它）、**圆角三档**（`--radius-item: 4px` / `control: 6px` / `panel: 8px` → `rounded-item` 等工具类）、`--oc-hover`（全局控件悬停底色）、`--oc-scrim`（弹窗遮罩，亮 .15 / 暗 .40）、`--oc-ink-fixed/paper-fixed`（固定底色上的文字）、`.touch-feedback`、`.row-rule`+`.rules-end`（可点整行的直线分隔）
- `scripts/design-audit.ts` — **设计令牌体检**（`npm run audit:design`）：扫全项目找像素圆角 / Tailwind 原色 / 暗色十六进制 / 黑·白半透明底 / 阴影 / 粗描边 / ring 光晕，并列出「重复 ≥3 次、该收进 ui-tokens 的类名串」。确有例外就写 `// design-audit-allow <规则名> 理由`。**提交前跑一次，0 违规才算过**
- `src/lib/sidebar-width.ts` — **侧边栏宽度唯一源**：默认 140px，可调范围 0.8–1.2 倍（112–168px），`clampSidebarWidth()` 负责夹取；宽度存在 settings 的 `sidebarWidth`（localStorage），拖动中只更新本地 state，松手才落盘
- `src/lib/cover/` — **封面卡算法唯一源**（角色 / 国家 / 事件的网格视图）：照搬 Simple_Cover 的「照片下缘逐行递增模糊 → 完全混色」+ 自动取色。`color.ts`（取色，**无彩度的图走中性、不猜色相**）· `blur.ts`（渐进模糊，纯函数，`npx tsx scripts/cover-check.ts` 自检 65 项）· `scene.ts`（画面合成；**文字衬底**按标题带实际亮度补块色，暗图不铺 —— 标题压在照片上不再靠图自己够暗）· `tuning.ts`（**所有版式数字的唯一源**，面板实时调，「视图 → 封面卡参数」或 `Ctrl/Cmd + Shift + K`）。**改这块先读 `docs/封面卡.md`**（算法、参数表、取色规则、性能策略）
- `src/components/shared/cover/` — `CoverCard`（三个列表共用的封面卡：标题压模糊区、简介与小字落色块、头像/国徽在标题上方）+ `CoverArt`（画布：进视口才画、一帧两张、按画布去重）+ `CoverTuningPanel`（调参面板）
- `src/components/shared/OverflowBar.tsx` — **工具栏收口的唯一实现**：按**容器实际宽度**（不按窗口）决定留哪些条目，放不下的进一个「…」菜单。`lead` / `trail` 永远不收（标题、保存、锁定）；条目收进菜单后长什么样由各自的 `menu` 给（**没给 `menu` 的条目收起来就是彻底消失**，只用于装饰）；`menuGroups` 是常驻菜单项（表格 / 查找这类从来不占栏的）。度量靠一条常驻的 `visibility: hidden` 度量行 + 每次渲染后重算（`ResizeObserver` 会漏掉「面板从 `display:none` 切回来」「字体加载完字宽变了」这类事件）。**新工具栏不要再自己写 `min-w-0` + `shrink-0` 那一套**：子项 `shrink-0` 只会把图标挤到隔壁按钮上
- `src/components/shared/ListShell.tsx` — **列表页外壳唯一实现**：页头贴在滚动容器**里面**（内容从它背后穿过），粘顶、底色、模糊、底线全由外壳的**一块页头表面**统一给；`header()` 只排内容，页头里的每一行（工具栏 / 文件夹条…）**不要**再各写一层底色或 `backdrop-blur`（多行页头各糊各的，落后那行就会漏成「没糊、内容穿过去」）。**静止无分隔线**，上滑后才叠 `TOOLBAR_SHADE`；`useScrollShade` 在 `src/lib/use-scroll-shade.ts`。列表页禁止再各写一套 `min-h-full` + `sticky` 的组合
- `src/components/shared/CoverFlow.tsx` — **画廊视图（Cover Flow）**：横向 snap 翻页，滚动时 rAF 直接写每格 `transform`（不进 state）；`prefers-reduced-motion` 退化成横排
- `src/components/shared/FolderStack.tsx` — 卡片 / 画廊里的**文件夹「堆」**：单击进入、右键改名 / 管理内容 / 删除。列表模式仍用 `CharacterFolderBar` 的 chip（文件夹图标 + 名称 + 数量）
- `src/lib/nav-sections.ts` — **侧栏板块表唯一源**（图鉴 / 创作 / 视图 + 主页 + 相册 + 工具插件图标）；侧栏与命令面板（`MenuBarSearch` 空白态）共用，新增板块只改这里 —— 以前两边各写一份，面板那份会漏掉后加的表格 / 地图 / 小说 / 工具
- `src/components/shared/list-dnd.tsx` — 拖拽排序 / 拖拽成夹（`@dnd-kit`）。起拖方式按指针类型自动选（`activation='auto'`）：**鼠标只认手柄、4px 起拖**（别写死 `longPress`，那会让桌面手柄也要按够 320ms），触屏才整卡长按 320ms；成夹 = 压住另一项停 350ms，**指针离开那张卡立刻撤销**（`MERGE_RELEASE_MARGIN`），Alt 掠过即生效
- `src/lib/templates/` — **模板系统（阶段一，进行中）**：`types.ts`（组件闭集 + `TemplateDoc`）· `registry.ts`（组件登记，**唯一的 id 来源**）· `defaults.ts`（**六个内置模板**：角色 / 事件 / 国家 / 词条 / 宠物 / 武器）· **`info-groups.ts`（基本信息组件 `InfoGroup` —— 独立于模板的字段组，存 `.ocstudio/info-groups.json`；内置宠物 / 武器，可改不可删；模板只存 `info.params.group = <id>`，**名字与模板名无关，关系只由「选择」决定**；字段类型有单行 / 数字 / 日期 / 开关 + **时间 / 结束时间 / 地点三种特殊类型（写实体列 time / endTime / location，不落 custom）**，**没有「多行」—— 长文本归正文组件**）** · `fields.ts`（读模板基本信息用到的字段键：有 `group` 读组件，没有就读老的内联 `fields`）· `note.ts`（笔记类模板判定；2026-11-06 起十一个组件在笔记宿主全部实装，判据只剩「含正文」）· `serialize.ts`（frontmatter ⇄ 文档，存 `.ocstudio/templates/<id>.md`）· `store.ts`（库优先、浏览器退化 localStorage，`useTemplates()`）· **`params.ts`（组件参数契约 —— 值 / 消费方 / 往返校验的唯一源）** · **`body-groups.ts`（**正文组件** —— 与 `info-groups` 同构的独立一层，存 `.ocstudio/body-groups.json`；内置 角色 / 国家 / 空正文，可改不可删；模板只存 `body.params.group = <id>`）· `body-preset.ts`（把选中的组件铺进新条目：Markdown → 编辑器文档，`unresolvedLinks: 'keep'` 保住 `[[还没建的条目]]`）** · **`support.ts`（接线 + 宿主可用组件 —— 唯一表：`availableComponents()` 收窄「添加组件」菜单）**。写作面上的悬停设置键（只给有组件库的两块：基本信息 / 正文）在 `components/shared/ComponentEdit.tsx` + `lib/templates/edit-target.ts`（`ComponentEditProvider` 由 `TemplateRenderer` 提供当前模板）· 配套 `components/settings/BodyPresetPanel.tsx`（列表 / 新建 / 改名 / 删除）+ `BodyPresetEditor.tsx`（EditorCore 写骨架，600ms 自动存；模板参数里的设置键深链 `body:<id>`）+ `src/components/shared/ComponentSection.tsx`（小节壳）+ `TemplateRenderer.tsx`（渲染循环，封面后不画线）+ **`template-blocks/`（简介 / 画廊 / 图片 / 头像 —— 不碰数据库的呈现块，所有宿主共用）+ `shared/TimeTrio.tsx`（时间三段输入）** + 设置 › 世界 › 模板；`npm run audit:templates` 查「模板与实现漂移」。**已接渲染循环（2026-11-06：组件全部接线；2026-11-10 时间 / 地点并回基本信息，组件收为十一个）**：词条 / 宠物 / 武器 / 分类条目 / 自建模板走 `features/world/components/note/NoteTemplateContent`（一处分发，世界观与分类条目共用）；角色（封面 / 头像 / 基本信息 / 立绘 / 关系 / 标签 / 相册 / 简介 / 动画 / 正文）、事件（封面 / 基本信息（时间 / 结束时间 / 地点是字段行）/ 简介 / 关系 / 标签 / 画廊 / 正文）、国家（封面 / 头像（旗帜）/ 名称+自建字段 / 关系 / 标签 / 画廊 / 简介 / 正文）把各自强类型列映射到同一批块。**立绘 / 动画 2026-11-09 起是角色专属组件**（数据仍是 `avatars` / `animation`；旧模板按 `版本:` 一次性补齐）；**头像也是独立组件**（封面只画横幅；没改过的角色 / 国家模板升级时自动打开它，改过的保持原样、封面兜底画一次）。**笔记宿主的六列是 2026-11-06 新加的**：`WorldEntry.avatar / image / gallery / time / endTime / location`（落盘键同名，`lib/vault/fields.ts` 是词汇表唯一源）；「关系」分三类 —— 手写命名边存 `WorldEntry.relations`（与实体同形，目标只能是另一篇笔记），父 / 子来自 `parentId`，引用 / 被引用来自正文 `[[ ]]` / `@` 的查询（`useNoteLinks`）。关系块「添加」直接落一条命名边，正文提及与命名边同一目标时只显示一行；角色的 `Character.relatedNotes` 是反向的同类边（角色 → 笔记，落盘 `related_notes`），笔记侧显示只读「来自该角色」。模板支持**新建 / 复制 / 重命名（旧名进别名）/ 删除 / 恢复默认**；**已做**：完整编排层（`TemplateComposer`：全宽三栏 + 结构预览 + 真实笔记 / 实体预览）、单篇笔记覆盖模板（`模板:` 键；候选只含笔记型模板，角色 / 事件 / 国家不在列，见 `note.ts` 的 `perNoteTemplates`）、自定义分类（分类 = 模板 + 一组笔记）。**组件参数**：`lib/templates/params.ts` 登记 `relations.presentation` / `title`、`gallery.mode` / `columns` / `title`、`image.width` / `title`、`summary.title`、`info.group`，以及各区块 `label`（标题文案，文本参数），编排行内直接改（只对真正消费的模板开放）；`info` 行展开是**基本信息组件选择器**（`TemplateParams.tsx` 的 `InfoGroupPicker`：按宿主过滤——只给笔记宿主：单选 + 每行设置键 + 底部「新建基本信息组件」；列型宿主（角色 / 事件）不开放这个参数（跳字段表走编辑器标题行的悬停设置键））；`audit:templates` 校验「值合法 / 有消费方 / 能往返」。参数面：设置 › 模板走行内展开，编排层（`TemplateComposer`）走右侧 360 抽屉；写回统一 `setTemplateComponentParams`（读当前缓存合并）。**改模板先读 `docs/模板.md`；加组件按 `docs/组件开发指南.md` §5 的清单走**。导出侧：静态站详情页消费模板的标题 / 显隐 / 组件开关与内容区块顺序（`export/site/build.ts` 的 `siteTemplateView` + `joinByTemplateOrder`），海报首次默认跟随模板开关与块顺序（`export/poster/options.ts` 的 `posterTemplateDefaults`）
- `src/lib/categories/` — **自定义分类**（分类 = 模板 + 一组笔记）：`types.ts`（`Category` + `分类:<id>` 导航键 + `enabled` / `builtin`）· `builtins.ts`（**内置分类 宠物 / 武器，默认不启用**，带 pawPrint / swords 图标与 pet / weapon 模板）· `icons.ts`（**可选图标闭集**，文件里存名字）· `store.ts`（`.ocstudio/categories.json`，库优先 / 浏览器 localStorage，`useCategories()`；内置项始终合并进表，老库里同名「宠物」会原地升级）。条目**复用 `worldEntries`**，靠笔记的 `category` 键归属；删除分类不删笔记。UI：侧栏只列 `enabled` 的分类、手机「更多」也列（`MobileSection = 'category'`）、`features/categories/CategorySection.tsx`（列表 → **就地编辑器**）+ `CategoryListToolbar`（搜索 / 排序 / 视图 / 新建，视图切换复用共享 `ViewToggle`）+ `CategoryRow` / `CategoryCard` / `CategoryGalleryCard`（画廊用 `CoverFlow` 顶排 + `VerticalSplit` 底排）+ `category-list-utils.ts`、`CategoryEntryEditor.tsx`（留在分类里按模板渲染，**不再跳世界观**）、设置 › 世界 › 自定义分类（内置分类在这里开关）。分类只能绑**笔记类模板**（`lib/templates/note.ts`）；词条自建字段走 `WorldCustomFields`（`WorldEntry.custom`），封面走 `WorldCoverField`（`WorldEntry.cover`，3:2），世界编辑器与分类编辑器共用

- `src/features/tags/` — 标签（维度，不是分类树）：`services.ts`（`getTagUsage` 扫四张实体表 / `mergeTag` 改实体 tag id + 删源标签 / CRUD）· `components/TagPicker.tsx`（编辑器内打标签，输入才列候选）· `components/TagBadge.tsx`（预设色完整字面量类名）· `components/TagsPanel.tsx`（设置 › 世界 › 标签：使用篇数 / 改名 / 合并 / 删除 / 颜色）。改名与合并**不手写文件**：`vault-persist` 的 `enqueueTagReferences` 会把引用实体排进落盘队列，下次 flush 用新名字重写 frontmatter；没有 aliases 读取层
### 编辑器（全局唯一内核）
- `src/components/editor/EditorCore.tsx` — 统一 Tiptap 实例（含移动端键盘工具栏与块面板）
- `src/components/editor/DocumentEditor.tsx` — 高级封装（加载 document 字段）
- `src/components/editor/mention-render.ts` — `@` 引用下拉（**原生 DOM 渲染器**，挂在 suggestion 生命周期上，刻意不用 React）
- `src/components/editor/BubbleMenuButtons.tsx` — 气泡菜单按钮组
- `src/components/editor/WikiLinkExtension.ts` — [[ 词条内链。**每个编辑器各建一份**（`createWikiLinkExtension()`），不要提升成模块常量：`popup` / `AbortController` 活在闭包里，模块级共享会让第二个编辑器把前一个弹层的「点外部关闭」监听 abort 掉、节点永久留在 DOM 里。弹层 `fixed` + Portal 到 `#overlay-root`，关闭只走 `closePopup()`（节点与监听一起收）
- `src/components/editor/extensions/ImageBlock.tsx` — 自定义图片块
- `src/components/editor/extensions/SmallMark.ts` — `<small>` 行内标记（vault 里唯一用到的行内 HTML，保住 Markdown 往返）
- `src/components/editor/extensions/FirstLineIndent.ts` — **首行缩进（中文排版）**：Tab 在段首插**两个全角空格 U+3000**，Shift+Tab 退一级、再按不变；多段选区按段处理；列表 / 表格 / 代码块里**直接放行**（表格的 Tab 是跳格、列表的 Tab 是降级）。**不要改成 `text-indent` 或半角空格**：`text-indent` 在 Markdown 里无处可存，半角空格 4 个会被 CommonMark 判成代码块、2 个会被解析器吃掉（`npx tsx scripts/vault-markdown-check.ts "<vault>"` 的定向用例盯着这条）。**Tab 被吃掉之后，Esc 是键盘用户离开正文的出口**（`editor-config.ts` 的 `handleKeyDown`：没有浮层时 `blur()`，有浮层时让浮层自己关）—— 别再把这个出口删掉，那是 WCAG 2.1.2 的键盘陷阱

### 架构
- `src/features/<domain>/` — 功能模块（characters, events, countries, world, timeline, relations, trash, periods, project, dashboard）
- 每个模块：`index.ts` (barrel) + `types.ts` + `services.ts` + `hooks/` + `components/`
- **实体编辑器统一形态**：`components/<X>Editor.tsx` = 页头 + 头图 + 各 section 组装（约 120–240 行）；表单状态/派生/保存管线放 `hooks/use<X>Form.ts`（返回单个对象，`export type <X>Form = ReturnType<...>`）；字段区拆成 `components/<X>InfoSection.tsx` 等。**关系不按实体各写一份**：角色 / 事件 / 国家共用 `components/shared/relations/RelationsSection`（表格 / 紧凑 / 图），form hook 只负责 `RelationRow[]` 映射。已按此收口：CharacterEditor / EventEditor / WorldLayout(`useWorldEntryDraft`) / SettingsDialog
- **列表页统一形态**：`components/<X>List.tsx` = 状态 + 过滤派生 + 空态/错误态 + 网格·目录渲染 + 浮层；列表项 `components/<X>ListItems.tsx`（Card/Row 共用 props）、页头 `components/<X>ListToolbar.tsx`、纯函数与偏好读写 `components/<X>-list-utils.ts`。已按此收口：CharacterList / EventList / CountryList
- `src/features/timeline/` — 已按职责分层：`hooks/useTimelineLayout`（纯派生：坐标/泳道/刻度/聚合桶）、`hooks/useTimelineViewport`（滚动/缩放/捏合/导航）、`components/{TimelineToolbar,EventNode,ParticipantTracks,PeriodBar,BucketView,EmptyTimeline}`、`constants.ts`、`utils.ts`（纯函数）。`ParticipantTracks` 从 `events.characters` / `events.countries` 算参与者轨道（未归属兜底、瞬时事件点），与主轴共用 x 坐标。**密度 / 轨道开关**在设置里（`timelineDetail` / `timelineShowTracks`），入口是「视图 › 时间线」；详模式第二行 = 时间 + 参与者名字；点参与条选中事件（连线换墨、参与条变墨），双击才打开编辑器
- `src/features/relations/` — 关系图：`layout.ts`（**力导向 + 碰撞检测唯一实现** `computeForceLayout`，含向心引力与目标尺寸回缩；无坐标节点在已钉住节点周围排环）、`services.ts`（`buildGraphData` / 拖拽建边 `createRelationBetween` / 存坐标 `saveNodePosition`）、`components/relation-graph-utils.ts`（`relationPlan` 连线语义表 + `routeEdges` 四向落点 + `MIN_ZOOM`）、`components/floating-edge.ts`（**连线几何唯一源**：正交 / 曲线 / 并行车道）、`components/RelationGraph.tsx`（8px 网格吸附 + 8px 中心对齐参考线 + 整理 / 撤销 + 框选 / 鼠标模式）。节点坐标存实体的 `graphPosition`（仓库写 `graph_position`），**不再用 localStorage 缓存**
- `src/lib/world-body.ts` — **词条正文的唯一读入口**：`worldBodyOf(entry)`（`document` 优先，`content` 只作老数据兜底 —— 可能是不带 JSON 的纯文本）、`hasWorldBody`、`worldBodyPatch(doc)`（写 `document`、把 `content` 清空）。**词条正文以前同时存在 `content`（JSON 字符串）与 `document`（对象）两份，装载时写两遍，必然漂**；现在写入只产 `document`，`scripts/world-body-check.ts`（`npm run audit:world`）盯着这条不变量
- `src/lib/entity-text.ts` — **实体正文纯文本唯一源**：`entityBodyText(kind, entity)`（词条走 `worldBodyOf`，其余 `document` 优先、老字段兜底）。能力层与全局搜索共用；判断「什么算正文」只在这里改
- `src/lib/search/` — **全局搜索内核**（顶栏 `Ctrl/Cmd+K` 与移动端搜索共用）：`index.ts`（打开面板时读一次 Dexie 建快照，正文按 `updatedAt` 缓存、30 秒 TTL、切库重置；标题 / 别名 / 字段 / 正文四路匹配，多词 AND，按实体类型分组）、`matcher.ts`（分词 / 打分 / 摘要 `buildSnippet` / 高亮 `splitHighlight`，纯函数，`npm run audit:search` 25 项）。结果行共用 `components/shared/search/SearchHitRow.tsx`；**`@` / `[[` 补全仍走 `reference-registry`（只认名字）**，别把正文匹配塞回注册表
- `src/lib/capabilities/` — **只读能力层（Agent 接入 A1/A2）+ 助手写入口**：`types.ts`（`Caller { actor, permissions }` / `CapabilityStore` / `CodexEntry`）· `index.ts`（`createCapabilities(store)`：`listEntities` / `getEntity` / `search` / `graphSlice` / `buildCodexSlice`，权限在入口检查）· `dexie-store.ts`（Dexie 适配器，软删除不返回）· **`agent-tools.ts`（助手工具的执行器：`createLibraryToolExecutor(capabilities, writer)` + `AGENT_CALLER`。读四件 `library_list/read/search/graph`；写十三件 `library_set_fields`（**标量白名单**；改名走单独的 `library_rename`）、`library_set_body`、`library_link`（建关系边，**只收真源在发起方的那四种**：角色→角色 / 角色→国家（国籍）/ 事件→角色 / 事件→国家，幂等）、`library_create`（新建条目，**必须走各 feature 的 `create*`** —— 手拼一行塞 Dexie 会漏掉操作日志与索引维护；`world` 还收 `category` / `template` / `parentId`）、`library_delete`（软删除，走各 feature 的 `delete*`，进回收站；**不要再让模型用 shell 删文件**）、`library_set_tags`（按名字打标签，没有就建）、`library_set_custom`（合并写自建字段）、`library_set_media`（写图片槽位；路径必须已在库内）、`library_rename`（改名 + 整组别名，走 `update*` 同步 `[[链接]]` 文字）、`library_set_placement`（只对 world：归类 / 换模板 / 换父级，只认目录里已有的名字）、`library_create_category`（新分类，给 fields 会一并建字段组 + 笔记模板）、`library_set_novel`（小说根的作品信息）、`library_import_image`（URL → Rust 下载到 `附件/` → 写槽位，≤20 MB）。参数一律当不可信输入校验，认不出来回 `isError` 不抛异常；写靠注入的 `LibraryWriter`，所以脚本里能跑假 writer）**。助手插件的接线在 `src/plugins/agent/host/library-tools.ts`（**动态 import**，否则构建期的 Node 里没有 IndexedDB；写用 `runAsActorAsync('agent:assistant')` 包住）。`scripts/capabilities-check.ts` 19 项 + `scripts/agent-plugin-check.ts` 168 项 + `scripts/journal-actor-check.ts` 19 项；**模型看的库手册**由 `scripts/gen-library-guide.ts` 从 `src/types/index.ts` + 白名单生成（`npm run gen:library-guide` / `npm run audit:library-guide`，类型改了重跑，别手写字段表）；**还没有 MCP / REST 传输层**。⚠️ `READ_PERMISSION = 0` 是**地板**，`requireRead()` 实际只拦非法 `actor`，读权限真正的闸在「造 Caller 的那一处」
- `src/features/project/` — 项目元信息（单例 `meta` 表，id 固定为 1）
- `src/lib/world-tree.ts` — **词条树唯一实现**（`buildEntryTree`）。层级只由 `parentId` 表达；编辑器目录与静态站导出共用同一份排序。`parentId` 悬空（父级被删）时该条当根，不消失
- `src/features/dashboard/` — 概览（主页）首屏。世界封面（`meta.coverUrl`，设置 → 世界）就是这一页的头图（`StretchyHeader`，3:2）；没设封面时不占位
- `src/lib/export/` — 导出器：`payload`（.ocbak + 图片内联）/ **`document`**（文档模型：标题 / 分区 / 条目 / 字段 / 正文，预览与三个格式共用）+ **`document-docx`**（Word，自拼 WordprocessingML + `lib/zip`）+ `markdown`（模型 → Markdown / TXT，纯函数）/ `download` / `site`（**静态展示站**：`render` 正文→HTML、`styles` 基础令牌、`templates` 三套版式（书斋 / 档案 / 画廊）、`build` 按 `shell` 输出侧栏或顶栏并组装单文件 `index.html`；`applySiteSections` 是分区开关唯一实现，`SiteExportConfig` 带标题 / 分区 / 纸色 / 内联图片 / 版式）/ **`poster`**（海报：`types` 契约、`catalog` 六套版式元数据、`options` 校验与夹取、`subjects` 实体→`PosterData`）。**`src/components/shared/export/ExportCenter.tsx` 是统一导出界面**（海报 / 网站 / 文档 / 备份四个页签，左预览右配置），入口在 `文件 › 导出中心`、`设置 › 数据`、移动端「更多」、模板编排「导出图片」；海报版式组件在 `src/components/shared/poster/`（`PosterCanvas` + `blocks` + `templates/`；封面槽统一用 `PosterCover`，取景几何在 `poster/cover-frame.ts` —— 遮罩固定、图在里面平移缩放，预览侧可拖 / 滚轮 / 双击复位）。`src/lib/export.ts` 只是 barrel。`src/lib/export/page.ts` 是**预览用的中性模型** `PageDoc`，渲染在 `src/components/shared/document/PagePreview.tsx` —— 导出中心的文档页签与**小说导出对话框**共用这一张纸（小说侧映射在 `features/novel/preview-doc.ts`）。`npm run audit:site` 查站点导出（46 项）、`npm run audit:export` 查海报契约（107 项）、`npm run audit:document` 查文档导出（39 项）；**改这块先读 `docs/导出器.md`**
- `src/components/shared/` — 共享组件（**`SectionSwap`**：列表 ↔ 编辑器 150ms 滑动；**`TimeTrio`**：年月日三段；封面卡在 `cover/`，封面画布 `CoverArt` + `lib/cover/`）
- `src/components/ui/` — shadcn/ui 基础组件
- `src/components/layout/` — 布局（AppShell, Sidebar, MenuBar + MenuBarMenus/MenuBarSearch/WindowControls, StatusBar, OverlayRoot, MobileTopBar, MobileTabBar, MobileFilterBar, MobileFab）

- `src/features/novel/` — 小说（**章节 = 笔记**）：`NovelSection`（书架，封面 2:3）/ `NovelTree`（章节树 + 复用 `EditorBodyPane` + 我们自己的编辑器内核）/ `export.ts`（Markdown / TXT）/ `docx.ts`（自带最小 ZIP writer，不引第三方）/ `pagination.ts`（9:16 · 16:9 · A4 估页）/ `services.ts`（建根 / 建章 / 元信息 / 章节大纲）。作品信息落 `novel_author` `novel_synopsis` `novel_target_words` `novel_notes` `novel_cover`，章节大纲落 `chapter_outline`；小说条目**不进世界观目录树、不进相册**（`lib/novel.ts#isNovelEntry`）
- `src/features/map/` — 地图（**视图**，不是实体）：`services.ts`（`normalizeAnchor` / `groupAnchors` / `setAnchor` / `setMapView` / `listMapAssets` / 地图笔记 CRUD）、`MapView.tsx`（整屏画布 + 浮层 + 拖动写回 + 底图）、`components/MapControlBar.tsx`（**控制条**：图层 + 六档底图合成一条，手绘底图整段不渲染）、`components/MapLibraryDialog.tsx`（**地图库 / 详情**：尺寸 / 类型 / 锚点数 / 标注数 / 重命名 / 删除 / 新建）、`MapView.tsx` 的整屏开关（`body[data-map-immersive]` 藏状态栏与 Mock 标）、`render-view.ts`（用存的 `map_seed` + `map_params` 在插件 Worker 里重画一档 → PNG）、`annotations.ts`（**政治标注**模型：国界 / 道路 + JSON 读写 + 命中测试；国界可带 `fill` 色板名）、`components/AnnotationLayer.tsx`（**stage 像素坐标系**的 SVG 层 —— 用 0–1 的方框会把顶点圆点拉成椭圆；线条色可调 + 纸色外壳 + 国界填充 22%）；`components/MapSwitcher.tsx`（左上名片垂下的地图列表）。锚点落实体 `map_position`（归一化 0–1）+ `map_id`；**点归实体、线归地图** —— 锚点存实体，国界 / 道路存地图笔记的 `map_annotations`；底图与每档渲染图都在 `.ocstudio/maps/`（后者固定名 `<地图名>-<视图>.png`，原地覆盖）；当前档位记 `map_mode`
- `src/features/tree-table/` — **「表格」页**（界面上叫表格，原「树表」；树形表格）：**词条树仍走 `buildEntryTree`**，国家树 / 角色分组 / 搜索展开全在纯函数 `tree-table-rows.ts`（`buildCountryTree` 悬空·自指·成环的父级当根；角色按国家分组、末尾「未归属」；搜索命中子孙时保留祖先路径并强制展开）；四个页签**角色 / 事件 / 国家 / 词条**（可拖拽调序，顺序存 `oc-tree-table-tab-order`，默认顺序与校验在 `tree-table-tabs.ts`；拖拽走 **Pointer Events 而不是 HTML5 拖放** —— Tauri 的 WebView2 在 `dragDropEnabled` 默认开启时会把 dragstart / dragover 当系统文件拖放收走，`draggable` 在桌面版拖不动）；整行点击进编辑器，名称列 / 角色种族·职业·所属国家**就地编辑**（`components/EditableCell.tsx`，只收纯文本字段 —— `制度` / `分类` / `时间` 可能是富文本，改回各自编辑器）；名称列悬停出「新增子项 / 删除」，删除词条或国家时**子项提升到被删节点的父级**，角色删除走软删除；标签列给 `TagBadge` 名字；页头搜索 / 计数 / 刷新 / 新增常在，「展开全部 / 折叠全部」只在真有层级时出现；新增建的是**当前页签**那类实体（默认值来自 `lib/entity-defaults.ts`）；显示一律纯文本（老库 `制度` / `职业` / `时间` 里是 HTML 富文本，剥标签复用导出站的 `plainTextOf`）。`npm run audit:tree` 20 项断言盯行模型。**页面标识（`activeItem` / 移动端分段）是「表格」**，侧栏归「视图」组、排在地图之前
- `src/plugins/map-generator/` — **第一个官方插件**（内置模块 + 插件形状接口）：`manifest.ts` + `index.ts`（唯一对外边界）+ `kernel/`（纯算法，**逐字节搬自改版 `features/map/generator`，不要「顺手清理」**）+ `worker.ts`。不碰 Dexie / localStorage / DOM / 用户文件；内置侧只留地图视图。**`npm run audit:mapkernel` 把内核输出的指纹钉死了**（种子 `77001` × 六组参数：四种大陆预设 + 区域图 + 极端值，逐项对比改版基线；另加「四种预设必须真的不同」「同种子可复现」「换种子必须换地图」）—— 2026-11-05 发现 `climate.ts` 被删了一行、`terrain.ts` 改了变量名，编译器不报错但地图已经变了
- `src/plugins/agent/` — **第二个官方插件（助手）**，**逻辑目录**整目录搬自 `D:\Codes\Simple-Agent`，不是我们写的：`core/`（纯 TS：SSE 解析 / 消息树 / 请求排序 / token 估算 / `agent/{loop,tools,prompt,trace}` 工具循环与 `allow·deny·always` 审批 / `markdown/` 流式渲染）+ `state/`（zustand）+ `api/`（Tauri 命令桥）+ `i18n/`。**这四个目录原样保留，上游更新可整目录覆盖**（只允许三处宿主差异：import 路径、`core/agent/tools.ts` 里注入的 `library_*`、`state/chat.ts` 的读库权限过滤与执行器）。**UI 层已宿主化，不跟着上游覆盖**：`components/ui/primitives.tsx` 的弹窗复用宿主 `components/ui/dialog`（Base UI：焦点圈 / Esc / 动画），`host/plugin-layer.tsx` 把菜单 / 弹窗挂进 `#overlay-root` 并包一层 `.oc-agent-root`（**浮层不包作用域就是裸 DOM**），toast 走全站 sonner，`styles/base.css` 不再自带调色板 —— 颜色 / 圆角 / 阴影全部继承宿主 `--oc-*`（含 `--oc-error/warning/success`，换主题预设面板会一起变）。`AgentPlugin.tsx` 是宿主挂载点（容器尺寸 / 亮暗同步 / 引导 / 会话列表宽度 / 「和助手聊聊」的一次性请求；**工作目录固定为当前笔记库**，设置里不提供选择入口；**会话按 `conversation.workspace` 绑定笔记库** —— 侧栏只列当前库的会话，切库时当前会话属于旧库就自动回到新会话，旧会话留在它自己的库里）。Rust 侧在 `src-tauri/src/agent/`（原样搬，只把 `crate::x` 改成 `crate::agent::x`）。**例外一处，升级上游时要手工保留**：`agent/tools.rs` 的 `run_shell` 在 Windows 上用 `raw_arg` 把整段命令原样交给 `cmd /S /C` —— 上游的 `.arg()` 会被 MSVCRT 再引用一次（内部 `"` → `\"`），而 `/S` 只剥外层那一对，于是引号进参数、重定向写不出文件、curl 报 URL 非法（`agent/tools.rs` 里有回归测试）。**存储是插件自己的**：系统 app data 下的一只 SQLite（`rusqlite`），钥匙串存密钥 —— 跟 `.ocstudio/` 笔记库**没有关系**，`own-storage` 这条权限说的就是这个。样式用 `scripts/scope-plugin-css.mjs` 收进 `.oc-agent-root` 作用域后再由 `globals.css` 引入；**读实体跟着插件启用状态走**（`read-entities` 是声明，助手一关就全关，`library_*` 不进请求，见 `host/library-tools.ts` 的 `libraryAccessGranted`）。条目页的「和助手聊聊」在 `components/shared/TalkToAgentButton.tsx`，一次性请求走 `lib/plugins/agent-bridge.ts`（不落盘，面板挂载后才消费）；**请求只带 kind / id / 标题，指令不进输入框** —— 它作为 `focus` 挂进会话资料（`lib/plugins/agent-session.ts`），由 `host/session-context.ts#buildSessionDataBlock` 拼进**系统提示词**，输入框只有一句人话（`agentContextOpener`）。**下一版助手设计（工具面 / 上下文分层 / 评估口径）见 `docs/Agent设计-下一版.md`**。**会话资料里的 id 是位置号**（扫描时按路径重新编号），所以 `lib/plugins/agent-session.ts` 连名字快照（`novelTitle` / `characterNames` / `focusTitle` / `vaultRoot`）一起存，用前由 `host/session-context.ts#resolveAgentSessionContext` 校准：库根变了整份作废、名字对得上就留、对不上按名字找回、找不到就丢。`novel_write_chapter` 在 **Agent 模式要显式传 `novelId`**，创作模式用会话里选中的那部；两条路都先校验目标确实是小说根（`category=小说` 且无上级）。异常路径统一走 `state/chat.ts#failTurn`（否则会卡在流式态）；审批没人回答 5 分钟自动取消
- `src/features/inspirations/` — **灵感（随手记）**，从改版（fork `features/inspirations`）补齐的超集项：`types.ts`（`Inspiration` + `inspirationText` 纯文本提取 + `inspirationTimeLabel` + `normalizeInspirations` / `parseInspirations` / `serializeInspirations`）· `store.ts`（`.ocstudio/inspirations.json` 优先、浏览器退 localStorage；快照 + `useSyncExternalStore` 订阅，与 `lib/categories/store.ts` 同一套形态）· **`use-inspiration-draft.ts`（保存唯一源：600ms 防抖 / 切条先 flush / 取编辑器文档）** · **`components/InspirationQuickNote.tsx`（唯一入口：顶栏窗口控制左边的灯泡 → 可拖小窗 340×440，列表 ⇄ 单条，可新建 / 删除 / 升级成笔记；挂在 `MenuBar`，编辑器内核按需加载；打开时落在最近记的那条）**。**侧栏那一项与整页 `InspirationSection` 已移除**（2026-11-06）：灵感是「想到就写」，不该占一个板块。**它不是实体**：不进词条树 / 相册 / 关系图，也不落成 `.md` —— 灵感是草稿，混进设定集就会被半成品淹没。**「变成笔记」**（在便签标题栏，Sparkles）：一键升级成 `worldEntries`，两条已有的正确通道各走一步 —— `createEntry`（写操作日志 / 索引）+ `saveEntryContent`（写 `document`，不是退役的 `content`），正文直接取当前编辑器实例的 JSON，不经过 HTML 往返；写成功要 `notifyDataUpdated()`（世界观目录是 react-query 缓存，不广播的话刚建的词条查不到、页脚「打开」跳不过去）。升级是**单向**的：灵感留着，`promotedId` + `promotedTitle` 记下它变成了哪一篇（**id 是扫描时按路径排的位置号**，换库 / 增删文件后会指向别的条目，所以「打开」按标题重新定位；找不到就说「原文不在了」）。`npm run audit:inspirations` 31 项断言盯「不丢字」（归一化、往返逐字、纯文本提取、promotedId / promotedTitle 往返）
- `src/lib/legacy/` — fork 数据**只读适配器**：`pr5-novels.ts`（`OCStudioNovels` 独立库 → 章节笔记）、`pr5-relations.ts`（`relations` 表 → 显式边）。三条规矩：只读、幂等、给报告
- `src/lib/relation-colors.ts` — 关系线色板与箭头唯一源（12 档 `--oc-accent-*`、`arrowEnds()`、非法值收敛）；`features/relations/edge-style.ts` 负责「怎么改一条边」
- `src/lib/theme-tokens.ts` — 主题令牌归属登记（`shell` / `page` / `both`），`npm run audit:theme` 双向自检
- `src/lib/theme/` — **官方主题 v1（只换颜色）**。**主题不是插件**（2026-11-05 定）：它没有代码、没有权限面，只是 `Settings.themePreset` 选中的一组令牌，别再往 `lib/plugins/` 里登记：`presets.ts`（**11 套**：中性 4 套 纸白 / 亚麻 / 松烟 / 青瓷 + 七色 7 套 朱砂 / 琥珀 / 苇黄 / 苔绿 / 海青 / 靛蓝 / 紫苑（赤橙黄绿青蓝紫），亮暗各一套 `ThemeTokens` + `preview`；主题色是数据，已进 `design-audit` 白名单）· `apply.ts`（`applyThemePreset(id, isDark)` 往 `<html>` 写行内 `--oc-*` + `data-palette`）· `boot.ts`（首帧启动脚本，`layout.tsx` 的 `<head>` 里同步落值，防闪回默认纸白）· `background.ts`（**背景图 v1**：压缩到长边 2560 WebP → Tauri 写 `.ocstudio/backgrounds/`（Mock 用 data URL）→ `html.oc-background` 铺图 + 纸色 wash；外壳 35% 纸色；填充 / 平铺 / 固定；遮罩 20–80%；有图时关 Mica）。设置项是 `Settings.themePreset` / `backgroundImage`（相对路径或 data URL）/ `backgroundMode` / `backgroundScrim`，UI 在设置 › 个性化；`npm run audit:palettes` 查亮暗对比度。静态站与模板海报已消费令牌；整图导出（关系图 / 时间线）还没做，见 `docs/主题.md` §5
- `src/lib/media-download.ts` — 图片 / 动画「保存到…」（系统保存对话框 + Rust `save_bytes` 原子写）；**浏览器 / `cap serve` 用 `isNativePlatform()` 判定，不要用 `isCapacitor()`**：Capacitor core 在纯 Web 里也会注入 `window.Capacitor`，用错会把浏览器下载扔进 Filesystem 分支，表现成「导出成功但没有文件」；`src/lib/video-upload.ts` — OC 动画上传（库内 `附件/`）

### 核心上下文
- `src/lib/editor-context.tsx` — ActiveEditorProvider（追踪当前聚焦编辑器）
- `src/components/layout/EditorContext.tsx` — EditorProvider + useEditor()（编辑状态 isEditing）
- `src/components/layout/NavigationContext.tsx` — activeItem 导航状态
- `src/components/layout/NavigationSourceContext.tsx` — 导航来源追踪
- `src/components/layout/MobileNavigationContext.tsx` — 移动端两层导航（section + gallerySubTab）
- `src/components/layout/MobilePageHeaderContext.tsx` — 移动端页面顶栏标题注册
- `src/components/layout/TrashOverlayContext.tsx` — TrashOverlayProvider（回收站浮层开关）
- `src/lib/KeyboardContext.tsx` — KeyboardProvider + useKeyboard()（Capacitor 键盘状态，visualViewport 计算高度）
- `src/lib/useBackButton.ts` — Capacitor 系统返回键处理
- `src/lib/browser-compat.ts` — 浏览器兼容性检测：Chromium 版本、HarmonyOS/ArkWeb、安全区域降级估算与修正
- `src/lib/reference-registry.ts` — @ 引用和 [[ 内链数据源注册
- `src/lib/settings.tsx` — 主题 / 同步 / 界面偏好（**`themePreset`**（官方主题 id，见 `lib/theme/`）、**`backgroundImage` / `backgroundMode` / `backgroundScrim`**（应用级背景图，data URL + 三种铺法 + 遮罩）、`sidebarVisible`、`sidebarWidth`、`editorLayout`、`mouseMode`、**`timelineDetail`**（简 / 详）、**`timelineShowTracks`**（参与者轨道）、**`coverTintMode`**（封面卡彩色 / 黑白：黑白跟主题走，亮=纸色、暗=墨色））设置
- `src/lib/use-device.ts` — useDevice() (isMobile)
- `src/lib/image-service.ts` — 图片全流程（含 Tauri/Capacitor/Browser 三环境适配）
- `src/lib/image-crop.ts` — Canvas 裁剪引擎（getCroppedBlob 支持 Blob 入参 + HEIF 自动转换）
- `src/lib/image-heif.ts` — HEIF/HEIC 格式检测与转换（isHeif / convertHeifToJpeg，heic-to 封装）
- `src/lib/adapters/capacitor-adapter.ts` — Capacitor 图片持久化适配器
- `src/lib/adapters/local-adapter.ts` — Tauri 本地文件系统适配器
- `src/lib/adapters/browser-adapter.ts` — 浏览器环境图片适配器

### 图片系统组件
**统一交互口径**：所有可编辑图片 **单击看大图，右键（移动端长按）出菜单**；图上不铺整块「更换封面 / 更换头像」遮罩，也不压删除 / 加号圆钮。菜单动作固定为「查看大图 / 更换 / 编辑 / 保存到… / 移除」，由调用方按槽位能力裁剪。入口是 `src/lib/use-media-menu.ts`。
- `src/components/shared/ImageUploader.tsx` — 单图槽位（封面 / 头图 / 头像 / 世界封面 / 小说封面）：单击看大图，右键 / 长按出菜单；支持裁剪流水线
- `src/components/shared/ImageCropper.tsx` — 全屏裁剪 + 缩放滑块（react-easy-crop）
- `src/components/shared/PeriodDialog.tsx` — 时期添加/编辑弹窗
- `src/components/shared/image-gallery/` — 图片画廊：`ImageGallery`(壳/模式分发 + 统一菜单) + `ImageGallerySlider`(滑动模式) + `ImageGalleryGrid`(网格模式) + `useImageUpload`(新增 / 更换 / 编辑同一位置)
- `src/components/shared/context-menu/` — 右键菜单内部：`context-menu-types` + `ContextMenuButton`(顶层与子菜单共用的项按钮) + `ContextSubMenu`
- `src/components/shared/FilterSelect.tsx` — 通用筛选下拉（触发按钮 + portal 面板 + 点外关闭），样式由调用点传入
- `src/components/settings/` — 设置弹窗（`SettingsDialog` 壳 + `tabs/{World,General,Data,About}Tab` + `controls` 开关/单选框常量 + `credits.ts` 关于页的开源致谢清单）。「数据」页签 = 原数据 + 云合并；**AI 页签已删除**（见约束 15）
- `src/components/shared/ProfileBannerEditor.tsx` — 头图+头像编辑（头图由 `StretchyHeader` 承载）；**无 hover 遮罩**：单击看大图，右键 / 长按出「更换 / 编辑 / 保存到… / 删除」
- `src/components/shared/StretchyHeader.tsx` — **弹性头图容器**：下拉放大（框跟着长高、头图等比放大所以不变形，左右多出来的被裁、上下不裁；含 Windows/Android 无原生回弹时的合成量）、滚动折叠、折叠视差。rAF 直写 style、不进 state；`prefers-reduced-motion` 下整体关闭。滚动容器按最近的 `overflow-y: auto` 祖先自动找
- `src/components/shared/FullscreenViewer.tsx` — 全屏查看

### Vault（文件夹设定集，仅桌面 Tauri）
**文件是真源，且是唯一真源**：一个文件夹 = 一套设定集（界面上叫**「笔记库」**），词条存成 Markdown + frontmatter，可用 Obsidian 直接打开。
文案分工：指代「你这个世界观」时叫**笔记库**（引导页 / 报错 / 设置）；让用户去点系统对话框时叫**本地文件夹**（`打开本地文件夹…` / `新建本地文件夹…`）。代码里仍然叫 vault，**两边只有这一条对应关系，别改标识符**。
**没有第二种数据源**：Dexie 只是本次会话的工作缓存，退出即散；「内置数据库模式」已废弃（仅在浏览器里作为 Mock 预览保留，右下角有 `DEV · Mock` 标）。备份格式**只有 `.ocbak`**（原名沿用），新旧差异由文件里的 `version` 字段在后端判断，不做第二套格式。单真源由 `src/lib/vault/` 实现。
- `src-tauri/src/vault.rs` — 自建文件 IO 命令（probe/scan/write_texts/write_bytes/import_file/read_bytes/move/remove/mkdir/exists）。**不用 JS 的 fs 插件**：那要在运行时给 fs scope 授权并跨重启持久化。含原子写（临时文件 + rename）、mtime 乐观并发、路径逃逸拦截、BOM 剥离、`spawn_blocking`（同步命令会卡死主线程）。带 **7 个单测**（含 IPC 线格式契约 —— 字段名改错不报错，只会静默变 `undefined`）
- `src-tauri/src/open.rs` — 用系统默认程序打开外链（`rundll32` / `open` / `xdg-open`，**不经过 shell**，只放行 http(s)），2 个单测
- `src-tauri/src/files.rs` — 导出落盘命令 `save_text(path, content)`：WebView2 里 `<a download>` 不可靠（桌面版导出会「点了没反应」），所有导出改走「系统保存对话框拿绝对路径 → Rust 写入」，同目录临时文件 + rename，3 个单测
- `src/lib/vault/types.ts` — 扫描输入 / 笔记 / 数据集 / 索引 / 报告类型
- `src/lib/vault/frontmatter.ts` — **外科式**读写：只替换我们拥有的键、只替换正文，键顺序与注释原样保留
- `src/lib/vault/fields.ts` — frontmatter 词汇表**唯一源**（键链）。读与写共用，从结构上消除导入器/导出器漂移
- `src/lib/vault/scan.ts` — 文件集 → 数据集 + 解析索引 + 体检报告（纯函数，不动磁盘）。链接解析键登记**三种**：文件名 / 去掉 `NN.` 序号的文件名 / frontmatter 标题 —— 仓库里三种写法真实共存（`02.元素与生命树.md` ← `[[元素与生命树]]`；`新词条.md` 的 `title: 苟利国家生死以`），只认文件名会把有笔记的链接判成「未知」
- `src/lib/vault/serialize.ts` — 实体 → frontmatter 更新。三条硬规则：**未改动就不写**（带装载快照）、**跟文件已有的键名走**（保留 `阵营`/`所属国家` 这类中文键）、**从不整体重写**
- `src/lib/vault/markdown/` — Tiptap JSON ⇄ Markdown 双向桥（`doc` / `to-tiptap` / `to-markdown`）。无法无损表达的节点附 ` ```oc-document ` 兜底块
- `src/lib/vault/markdown-bridge.ts` — 解析层与 Markdown 层的粘合剂；唯一知道「哪种实体的正文在哪个字段」的地方（**词条也已收敛到 `document`** —— 读入口是 `lib/world-body.ts`，`content` 只剩老数据兜底）。链接写回：节点上有 `raw` 就逐字还原；编辑器里新插入的引用按 `[[文件名|标题]]` 写（文件名带 `NN.` 序号时只有这样才能让 Obsidian 也解析得到）
- `src/lib/vault/vault-fs.ts` — Tauri 命令的 TS 门面（含 `isVaultSupported()`）
- `src/lib/vault/vault-load.ts` — 读盘 + 建会话 + 整库替换 Dexie（**挂起落盘**）
- `src/lib/vault/vault-persist.ts` — 落盘队列：挂在 **Dexie dbcore 中间件**上，`dbcore.table().mutate` 是所有写入的唯一入口，一处接线覆盖全部写入路径；只在事务外做 IO；**绝不静默删除文件**（`deleteRange` 一律忽略）。主键要**同时**看 request 的 `keys` 与 response 的 `results` —— 不带 id 的 `add`/`bulkAdd` 只有在 response 里才拿得到自增主键，漏了它新行永不落盘；单条序列化失败只记错并把该行留在队列，不连坐整批。**外部改动冲突**：目标文件 mtime 变了就跳过、不覆盖，条目停在 `conflictedKeys` 里**不自动重试**（否则每 350ms 撞同一个错），恢复自动重试有两条路 —— 用户再改一次（`enqueue` 清掉标记），或明确点「覆盖磁盘」（`drainVaultWrites({ overwriteConflicts: true })` 把基准 mtime 换成磁盘的再写）。回收站恢复撞名时按 `allocateRelPath` 改名，不覆盖同名的另一条
- `src/lib/data-events.ts` — 跨模块「数据变了」的唯一广播（`DATA_UPDATED_EVENT`）。**列表 / 画布类 hook 必须订阅**：角色 / 事件 / 国家 / 时期 / 词条 / 地图 / 时间线 / 标签 / 小说书架 / 相册。漏订阅的症状是「刚改的东西切过去还是旧的，重启才出现」。写入侧只在**离散动作**后 `notifyDataUpdated()`（新建 / 删除 / 导入 / 助手写入 / 改名），**不要在每次自动保存里发** —— 相册要扫全库正文图片，跟着打字重扫会拖慢编辑
- `src/components/shared/GlobalAlbum.tsx` — 相册是**常驻挂载**的（分区用 `data-visible=false` + `display:none` 隐藏）。除了订阅 `DATA_UPDATED_EVENT`，它还盯外层分区的 `data-visible`：从隐藏变可见就重扫一遍（换立绘、正文插图之后切回来要能看到）。新加常驻分区的列表若「只在挂载时读一次」，都会踩这个坑
- `src/lib/vault/export-dir.ts` — **老数据 → 文件夹**的全量物化（笔记 + 图片 + `tags.json` + `fields.json` + 标记文件）。只写不删；目标文件夹**可以已有笔记**，合并策略（跳过/覆盖/保留两者/清空并导入）原样作用于同名文件（「清空并导入」只是把旧笔记挪进 `.ocstudio/trash/`）；`scripts/vault-migrate-check.ts` 是它的内存闭环自检
- `src/lib/vault/vault-paths.ts` — 路径分配（纯函数）：Windows 非法字符、保留设备名、撞名去重、回收站路径；**目录推断 `foldersOfKind` 只认「活着的、不在 `.ocstudio/` 里」的笔记**（回收站条目仍留在会话索引里，混进来会把新建文件写进 `.ocstudio/`；`scripts/vault-paths-check.ts` 有用例）
- `src/lib/vault/vault-session.ts` / `vault-registry.ts` / `vault-tags.ts` / `vault-marker.ts`
- `src/lib/vault/vault-assets.ts` — 素材引用的改写原语（`planImageRewrites` / `allocateAssetPath`）。图片由落地迁移一起搬（字段 + 正文 + `data:` URI）；**没有**单独的「把旧图片收进文件夹」动作了，那半套只认字段，会搬一半
- `src/lib/vault/journal.ts` — **创作时间线**（`.ocstudio/journal.jsonl`，只追加）：行格式、sha256、tail 解析、JSON 导出（`buildJournalExport`，带 version）。落盘 flush 里对每次真正写成功的改动追加一条（新建 / 保存 / 移入回收站 / 还原 / 彻底删除）；**只做仓库模式**，不做回滚 / diff / 全文快照。磁盘侧命令在 `src-tauri/src/journal.rs`（`journal_append` / `journal_tail`）
- `src/lib/vault/vault-provider.tsx` — 上下文。状态是**派生**的（`useSyncExternalStore` 读环境）：`isVaultSupported()` 服务端为 false，直接做 useState 初值会造成水合不一致
- `src/lib/vault/legacy-backup.ts` — **首次绑定笔记库前的自动备份**：`lastVaultPath() === null` 且内置库非空时，先把整库导成 `<目标文件夹>/.ocstudio/legacy-backup-<时间>.ocbak` 再 `loadVault`；写不出来就抛错中止开库（宁可打不开，也不白清）。`migrateLegacy` 传 `backupLegacy: false` 跳过（数据本来就已经写进那个文件夹）
- `src/features/vault/` — UI（`VaultGate` 启动闸门 / `VaultWriteBanner` / `VaultMenuSection` / `VaultStatus` / `VaultSurfaces` / `VaultOverlay` / `VaultScanReportDialog` —— 界面上叫**概览**：一行「N 篇笔记 → 构成」，正常时只说「没有发现问题」，有异常才出现一条「未知 N 项」，点开才是文件清单）；`components/JournalTimelineDialog.tsx` 是「视图 › 创作时间线」（全库 journal 只读审计流，按日期分组，不做回滚）
  - 欢迎页（`VaultGate` 的 idle 分支）= 单列 288px 网格：标题 → 旧数据组（「检测到 N 条旧版本数据」+ 导出备份 / 备份旧版本数据并导入到…）→ 打开已有 / 新建文件夹 → 一行黄色提醒。旧数据组只在 `orphanCount > 0` 时渲染，且**排在主按钮上方**（压在最下面时用户会先点按钮、把旧数据顶掉）
  - `hooks/useLegacyImport.tsx` — 「备份旧版本数据并导入到…」的唯一实现，欢迎页与「文件」菜单共用。对话框由**调用方**渲染：`DropdownMenuContent` 关闭时整棵卸载，挂在下拉里会跟着消失
  - `components/shared/SeedData.tsx` — 桌面版**不播种**（判 `isVaultSupported()`，不能只判 `isVaultEnabled()`：那个标记首次绑定后才置位，全新安装会先塞 10 条示例，再在欢迎页当成「旧版本数据」）
- `scripts/vault-analyze.ts` — 离线体检 + 内存往返验证
- `scripts/vault-frontmatter-check.ts` — 外科式读写原语的**逐字节恒等**检查
- `scripts/vault-body-diff.ts` — 正文往返差异归因（按签名聚合）
- `scripts/vault-write-acceptance.ts` — **文件夹级**验收：复制真实 vault → 三处改动 → sha256 比对全目录，非预期改动必须为 0
- `scripts/vault-markdown-check.ts` — 正文桥自检（定向用例 + 全量幂等 + 文本级归因）
- `scripts/vault-migrate-check.ts` — 老数据迁移的**内存闭环**自检：造旧库 → 物化 → 扫描读回 → 逐字段比对（29 项断言，不需要真实 vault）

**Vault 的验证口径（改这块代码前先跑一遍）**
```
npx tsx scripts/vault-migrate-check.ts                        # 老数据迁移闭环，40 项断言
npx tsx scripts/journal-check.ts                               # 时间线行格式 + JSON 导出，19 项断言
npx tsx scripts/vault-analyze.ts "<vault>" --roundtrip        # 内存往返，5 项
npx tsx scripts/vault-frontmatter-check.ts "<vault>"          # 手术原语恒等
npx tsx scripts/vault-write-acceptance.ts "<vault>"           # 真实文件落盘，非预期改动 0
npx tsx scripts/vault-markdown-check.ts "<vault>"             # 正文桥 72 项断言
cargo test --manifest-path src-tauri/Cargo.toml --lib         # 含 IPC 线格式契约
```

**已知的规范化边界（无法逐字节还原，已向用户披露）**：被编辑的那一篇，块间空行会统一成一行（节点不记录间隔空行数）；表格单元格内空白；`**A**B**C**` 这类 CommonMark 读成嵌套 strong 时定界符位置会变（渲染不变）。**未编辑的笔记零改动** —— 写回按**文档**比较而不是按正文文本比较，这一点是「不弄脏用户文件」的关键

### 移动端交互
- `src/components/shared/MobileActionSheet.tsx` — iOS 风格底部弹出菜单（长按触发）
- `src/components/shared/mobile-text-selection/` — 移动端选词工具栏（复制/剪切/粘贴/全选 + 插入/表格动作面板），事件驱动状态机，@capacitor/clipboard 原生剪贴板。分层：`constants`（常量与状态/事件类型）、`geometry`（可编辑判定 / 锚点测量 / 选区解析，纯函数）、`clipboard`（剪贴板读取 + 编辑器 DOM 兜底）、`useMobileSelectionState`（状态机 + 计时器调度与收尾）、`useMobileSelectionEvents`（事件源）、`useMobileSelectionActions`（动作与面板条目）
- `src/components/shared/GlobalContextMenu.tsx` — 全局 input/textarea 右键菜单，通过 `InputMenuContext` 暴露 `openMenuAt`
- `src/lib/use-input-context-menu.ts` — 移动端 input 组件级长按菜单 hook，在元素自身绑定事件，不监听 document
- `src/lib/tauri-clipboard.ts` — Tauri 剪贴板管理器封装（`tauriReadClipboard`）
- `src/components/shared/DeleteButton.tsx` — 桌面端删除按钮（含 AlertDialog 二次确认）
- `src/lib/useLongPress.ts` — 长按 hook（320ms 阈值，8px 移动容差；回调带按下坐标，长按后吞掉合成 click）
- `src/lib/use-media-menu.ts` — **图片右键 / 长按菜单唯一呼出入口**：`handlersFor(target)` 展开到图片元素上，桌面右键与移动端长按落到同一套 `MediaContextMenu`
- `src/lib/haptics.ts` — Capacitor 触觉反馈封装

### 配置
- `opencode.json` — OpenCode 核心配置
- `.opencode/skills/` — 6 个技能文件（guide, coding, design, codebase, prd, sync）
- `package.json` — 依赖和脚本
- `src-tauri/tauri.conf.json` — 打包目标 `nsis` + `msi`；`bundle.windows.wix.version` 必须是纯数字（Windows Installer 不接受 `-beta` 后缀），发版改版本号时这里一起改（当前 `0.20.3`，应用内版本由 `package.json` 的 `0.20.3-beta` 决定）
- `scripts/msix.ps1`（`npm run tauri:build:msix`）— **微软商店包**。Tauri 只出 msi / nsis，商店收 MSIX，所以这里手工组包：`tauri build --no-bundle` 出 `app.exe` → 生成 `AppxManifest.xml` + 图标 + `resources.pri`（`makepri`）→ `makeappx pack` → `signtool` 签名 → **把已签名的 .msix 压成 zip、改名 `.msixupload`**。产物在 `src-tauri/target/release/msix/`。
  - 商店身份（Partner Center › 产品标识，已固定）：`Identity/Name = Pokanshuu.OCStudio`，`Identity/Publisher = CN=C585EFD6-1C30-48E8-A8B0-2F1DD03460DB`，包系列名 `Pokanshuu.OCStudio_bhwwq0v85wsey`。发包用：
    `npm run tauri:build:msix -- -Publisher "CN=C585EFD6-1C30-48E8-A8B0-2F1DD03460DB" -MakeCert`
    （`-MakeCert` 会为这个 Publisher 现生成一张自签代码签名证书 —— **签名证书 Subject 必须等于清单里的 Publisher**，否则包不合法）
  - 两个踩过的坑：**① `.msixupload` 不能是 `makeappx bundle` 的产物**（bundle 自带的 `AppxBundleManifest.xml` / `AppxBlockMap.xml` / `[Content_Types].xml` 会被商店判为"不支持的文件"），必须是只装包文件的 zip；**② 身份不符**报的是包系列名（PFN）对不上，PFN 由 `Name + 发布者哈希` 算出，换 Publisher 就等于换 PFN
- `next.config.ts` — Next.js 配置
- `tsconfig.json` — TypeScript 配置
- `eslint.config.mjs` — ESLint 配置

## 开发命令
```bash
npm run check     # 提交前一条命令：tsc --noEmit + eslint + 全部 audit:*（约 30s）
npm run dev       # 开发服务器 (localhost:3000)
npm run build     # 生产构建 (静态导出)
npm run lint      # ESLint
npm run audit:design  # 设计令牌体检（0 违规才算过）
npm run audit:theme   # 主题令牌归属（shell / page / both）
npm run audit:palettes  # 官方主题亮暗对比度
npm run audit:templates  # 模板与实现漂移（组件登记 / 往返 / 别名）
npm run audit:stores   # 模板 / 组件四份配置的写路径（装载前禁写 / 删除清文件 / 并发 / 迁移顺序）
npm run audit:site   # 静态站导出逻辑（角色路由 / 时间标签 / 本地日期 / 未知引用 / 分区 / 标题纸色 / 三套版式）
npm run audit:export  # 海报契约（六套版式 / 元数据 / 画布 / 选项兜底 / 正文顺序 / 封面取景）
npm run audit:document  # 文档导出（Markdown 无 HTML 噪声 / TXT / Word XML / 预览模型 / 分区裁剪）
npm run audit:capabilities  # 只读能力层（权限入口 / 列表 / 读取 / 搜索 / 切片）
npm run audit:agent   # 助手接缝 + 能力卡片漂移 + 固定前缀预算
npm run measure:agent-tokens  # 助手每任务 token 对照（改前基线 + 真实循环交叉验证）
npm run audit:search  # 全局搜索匹配（分词 / 打分 / 摘要 / 高亮）
npm run audit:tree    # 表格（树形表格）行模型（层级 / 分组 / 搜索保留祖先）
npm run audit:map    # 地图锚点 + 国界填充色
npm run cap:dev   # Capacitor 构建 + 同步 + 打开 Android Studio
npm run cap:hot   # Capacitor 构建 + 同步（热更新）
npx tauri dev     # Tauri 桌面开发
npx tauri build   # Tauri 打包 (.exe/.msi)
```

## 核心约束
1. **设计系统**：加载 `oc-studio-design` skill。禁止 `#000`/`#FFF`，使用设计令牌
2. **界面原子**：类名一律取自 `src/lib/ui-tokens.ts`（字段行 / 标题 / 按钮 / 输入 / 浮层 / chip / 圆角 / 空态），不要就地拼写；**极小圆角（只有 4 / 6 / 8 三档，圆形头像/徽章/色点例外）、控件零描边**（输入只有一条底线），线只用于区块之间 / 表格行 / 浮层边界 / 空态占位框
   - 圆角只有三档：**小 `rounded-item`(4)** 行/chip/图/卡片 · **中 `rounded-control`(6)** 按钮/控件/菜单浮层 · **大 `rounded-panel`(8)** 弹窗/面板/抽屉。每个元素归哪档的对照表在 `oc-studio-design` skill「圆角」一节，照表取，不凭感觉
   - **禁止 `rounded-[6px]` 像素字面量**；也禁止 `rounded-sm|md|lg`（Tailwind/shadcn 固定值）、裸 `rounded`、以及已废弃的 `rounded-media` / `rounded-menu`。组合式类名用 `ui-tokens` 的 `ROUND_*` 常量拼；圆形（头像/徽章/色点/开关/图上的圆钮）直接写 `rounded-full`
   - **页签（Tabs）选中 = 2px 墨色下划线**，悬停只换文字色；其余「选中」才用浅底块
   - **外壳**：菜单栏 / 状态栏 / 侧边栏之间不画线，三块共用同一表面（底色只由 globals.css 的 `[data-app-shell|data-menubar|data-sidebar|data-statusbar]` 规则给，**Mica 下必须透明**，父级禁止再铺 `bg-*`）；内容区是一块 `bg-paper` + `border border-line` + `rounded-control`(6px) 的面板，**不加内外边距**，那条 border 就是 chrome 与内容之间的唯一分隔线
   - **侧边栏宽度**：默认 140px，拖右边缘可调 112–168px（0.8–1.2 倍），双击复位；拖拽条是一条 6px 命中区、悬停才显 `--oc-hover`，**不画分隔线**（外壳之间本来就不许有线）。常量与夹取逻辑在 `src/lib/sidebar-width.ts`，别再就地写 140
   - **阴影**：内容面（卡片 / 按钮 / 输入）零阴影；浮层（菜单 / 下拉 / 右键 / 弹窗 / 抽屉 / 通知）只用唯一一档 `FLOAT_SHADOW`（`float-shadow`，值在 `globals.css`）。禁止 Tailwind `shadow-sm/md/lg` 与自编阴影值，`audit:design` 的 `shadow-literal` 会拦
   - **设置弹窗**：衬线只给弹窗标题（`PAGE_TITLE`），内部一律黑体 —— 分组标题 `text-sm font-medium text-ink`、字段标签 `text-sm text-ink`、说明 `text-xs text-ink-faint`；**动作按钮文字居中**，二级页面入口按列表行两端对齐（文字靠左、`›` 靠右）。**行只有两种**：开关 / 单行输入 = 标签靠左、控件靠右（`SETTINGS_TOGGLE_ROW`）；单选组 / 色板 / 图片 = 标签在上、控件在下（`SETTINGS_FIELD`，挤成两列会把「白天模式」折行）。细则见 design skill「设置弹窗」
   - 浮层菜单（右键 / 下拉 / 筛选 / @ / / ）一律：容器 `MENU`（只留 `py-1`，**没有左右内边距**）+ 行 `MENU_ITEM_BASE`（自带 `px-3`）—— hover 才能横向铺满、左右不留缝；行高 `py-1`（27px），不要再用 `py-1.5`
   - **禁止原生 `<datalist>` / `type="date"` 这类系统控件**：弹出层由 WebView 自己画、不在 DOM 里，圆角/阴影/宽度/暗色全部够不着（会出来一块跟设计系统无关的灰卡片）。需要「输入 + 建议」就自己写 input + portal 到 `#overlay-root` 的 `MENU` 面板（参考 `FilterSelect`）
   - 主题切换交给 `bg-paper` / `text-ink` 这类令牌本身，**不要再叠 `dark:bg-[#1C1B1A]` 这种十六进制**（等于把令牌抄一遍）
   - 「抬起 / 选中」的浅底色一律 `bg-[var(--oc-hover)]`，不要用 `bg-black/5 dark:bg-white/5`
   - 固定底色色块（时期条 / 标签）上的文字用 `text-ink-fixed` / `text-paper-fixed`（不随主题翻转），配 `isLightColor()` 判断
3. **系统右键菜单**：`GlobalContextMenu` 在 document 上统一拦截 —— 非文本区 `preventDefault()`（不弹 WebView 自带菜单），输入框 / textarea / 可编辑区保留系统菜单
4. **数据层**：Dexie 唯一数据源，通过 hooks 访问，软删除默认启用
5. **编辑器**：复用 EditorCore，不创建新实例
6. **浮层**：必须 Portal 到 `#overlay-root`；**坐标在打开前量好** —— 点击事件里量锚点，和 `open` 同一批 `setState`。禁止「先按 (0,0) 渲染、再在 `useEffect` 里量真实坐标」，中间会画一帧在左上角（下拉「闪现再归位」，`FilterSelect` / `SortSelect` / `MenuBarSearch` 已按此改）
7. **代码风格**：TypeScript strict，禁止 `any`，`export function` 导出
8. **移动端布局**：CSS-first 方案（`max-md:hidden`/`md:hidden`），不依赖 `useDevice()` 做壳切换
9. **图标规则**：返回/关闭=ArrowLeft，折叠=ChevronLeft，展开=Menu，统一 `strokeWidth={2}`
10. **模糊效果**：`backdrop-blur` 的 header 必须放在滚动容器内部（非平级兄弟）。多行页头（工具栏 + 文件夹条…）只用 `ListShell` 的**一块页头表面**盖住整块页头，不要逐行糊。同时滚动容器**不得**有 `padding-top`/`padding-bottom`，padding 不参与滚动，内容无法到达 fixed bar 背后。必须用内容内部的透明 spacer div 替代（顶部 `<div className="md:hidden h-[calc(60px+var(--safe-top))]">`，底部 `pb-24`）。
11. **安全区域**：所有移动端固定定位元素使用 `h-[calc(60px+var(--safe-top))] pt-[var(--safe-top))]` 模式（精确高度，非 min-h）。CSS 变量定义在 `globals.css`，Java 层在 `MainActivity.java`
12. **移动端触控反馈**：所有移动端可交互控件必须提供按压反馈，分两层规则：
   - **有边框**（`border border-line`）→ `touch-feedback` class，提供 120ms `scale(0.96)` 缩放反馈
   - **无边框** → `active:bg-[var(--oc-hover)]` 背景高亮反馈
   CSS 定义在 `globals.css` 的 `.touch-feedback` 规则中。例外：MobileTabBar 和 GlobalAlbum 分类切换按钮保持简洁无感
13. **文案节制**：**Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.**（不写多余的次级标签与说明文字，解释交给布局）
   - 标题下不加副标题句、设置项下不加说明、按钮里不加第二行小字；禁用态已由 `opacity-50` / `cursor-not-allowed` 表达，不再补「不可用 / 桌面端支持」；placeholder 不复述标签
   - 只有四类说明可留，且必须**一句话 ≤ 20 字、紧跟被说明的元素**：破坏性后果 / 数据口径 / 隐私安全 / 功能未开放（「开发中」）
   - 不写「注：」「说明：」「提示：」这类散文前缀；`npm run audit:design` 的 `prose-prefix` 规则会拦。完整规则与四问审查表见 `oc-studio-design` skill §9
14. **未保存状态**：唯一口径是「当前值 ≠ 已保存值」（`src/lib/dirty.ts` 的快照签名），表单只**上报** `reportDirty(boolean)`，**不要再手工 `markDirty()`**。手工置位是个只进不出的闩——「输入一个字再删掉」「Ctrl+Z 回到原样」「保存后值被规范化（`3` → `03`）」都会留下抹不掉的脏标记，返回时就弹「有未保存的更改」。正文先用 ProseMirror 文档与基线文档 `doc.eq()` 快速比对，不等时再用 `sameDocIgnoringTrailingSpacer()` 复核 —— **末尾的空段落不算改动**：StarterKit 默认开启的 `TrailingNode` 会给「以分割线 / 图片 / 表格 / 代码块结尾」的正文自动补一个可输入段落（旧数据大量是这种结尾），不忽略它就会「点进去什么都没做也提示未保存」
15. **AI：不做内置功能，只做能力层**（2026-10 删除内置 AI；2026-10-31 定方向）
   - **已删除，不要恢复**：`src/lib/ai/`、`EventAiSummary`、设置里的 `AiTab`、`settings.tsx` 的 `ai*` 字段、`useEventForm` 的概括逻辑
   - **不做内置用例**（摘要 / 一键生成 / 内置对话）：它们绑死模型与提示词，而通用 agent 能力覆盖了这些用例
   - **做的是能力层**：把库以只读（默认）或受限写入的方式开放给外部 agent（MCP 优先）与插件；写入必须走落盘链路，journal 要带 `actor`。设计见 `docs/Agent接入.md`
   - 界面上**不出现「AI」字样**、不承诺 AI 能力；产品口径见 `oc-studio-prd` skill §1

## 已知差异（技术债，待后续修复）
- **解耦已收口**：无「真·God 组件」。`≥300 行` 仅剩已抽出的层/壳：`lib/use-entity-workspace.ts`（编排层）、`features/timeline/components/TimelineView.tsx`（壳+画布 JSX）、`features/world/components/WorldLayout.tsx`（壳+编辑区 JSX）、`features/timeline/hooks/useTimelineViewport.ts`、`lib/seed/index.ts`（播种脚本）—— **再拆就是为拆而拆，不要动**
- 仓储层（`lib/repository.ts`）的 `Table<T, number, TInsert>` 第 3 个泛型位、实体 `id: number` 必填、`EntityTable` 的用法是**互相咬合**的：省掉第 3 个泛型位会让 `listActive` / `getById` 的返回值被推断成「id 可选」，从而在全项目催生 `as number` 断言。改动前先读 `src/lib/repository.ts` 顶部注释

## 待办与改进清单
- **文档入口是 `docs/README.md`**：读之前先看那里，它列了每份文档的状态（活文档 / 设计稿 / 索引 / 归档）
- 详见 `docs/todo.md`（按领域分节；**只记还没做的**，做完删行）
- 领域文档（每个领域一份，改动前先读对应的那份）：
  - `docs/模板.md` — 组件化模板（组件分级、文件格式、视觉契约、模板/导出/标签管理界面）
  - `docs/组件开发指南.md` — 加一个组件的完整流程、注册表、参数契约、审计断言
  - `docs/时间线.md` — 参与者轨道、事件连线、关键节点
  - `docs/关系图.md` — 静态手摆（**实时物理已放弃**）、正交边、节点形态
  - `docs/相册.md` — 图片组件原子化（**方向未定**）
  - `docs/插件.md` — 社区插件（沙箱 + 白名单 RPC）、两个官方插件、skill
  - `docs/主题.md` — 自定义令牌与主题包（三层 + 两级作用域）
  - `docs/Agent接入.md` — 库 API + MCP/插件适配器、权限分级、`actor` 留痕
  - `docs/Agent设计-下一版.md` — 助手下一版的工具面 / 上下文 / 评估（P0 已落地，P1 工具收敛未做）
  - `docs/小说.md` — 章节 = 笔记、大纲用 `parentId`、导出器
  - `docs/地图.md` — 地图是视图不是实体；锚点归一化存在实体上
  - `docs/导出器.md` — 全局导出中心（海报六套版式 / 静态站三套版式 / 文档 / 备份；预览、参数、预设）
  - `docs/封面卡.md` — 网格卡片的模糊与文字版式、`lib/cover/tuning.ts` 参数
  - `docs/macOS适配.md` — 平台差异、踩过的坑、构建与验证清单
- 索引：`docs/现状问题.md`（**只记仍然成立**的架构债）· `docs/待设计决策清单.md`（只有作者能拍板的事）
- 归档：`docs/归档/`（执行完的计划 / 被取代的需求 / 一次性审查，**不再维护**；索引在 `docs/归档/README.md`）
- 自定义集合（L2）需求见 `docs/归档/自定义分类-需求文档.md`（**已被 `docs/模板.md` 取代**，仅作参考）；**未实现**，实现前先出 fork 冲突地图（`git merge-tree`）
