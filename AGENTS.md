<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# OC Studio

**v0.19.0-alpha** — 本地优先的原创角色（OC）与世界观创作工作台。

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
- `src/lib/env.ts` — 环境检测唯一权威（isTauri / isCapacitor / isNativePlatform）
- `src/lib/version.ts` — 版本号单源（读 package.json）
- `src/lib/open-external.ts` — 用系统浏览器打开外链（桌面走自建命令 `open_external`，见 `src-tauri/src/open.rs`；浏览器/Capacitor 走 `window.open`）。**Tauri 里 `target="_blank"` 是死的**，别再直接写 `<a>`
- `src/lib/tag-colors.ts` — 标签预设色板唯一源（`pickTagColor` / `normalizeTagColor`；`TagBadge` 按色值映射到**完整字面量**类名，Tailwind JIT 不能拼接）

### 界面（设计令牌唯一源）
- `src/lib/ui-tokens.ts` — **界面原子类唯一源**，改 UI 时从这里取，不要就地拼写。分八组：标题（PAGE_TITLE / SECTION_TITLE）· 页头（TOOLBAR / EDITOR_HEADER / EDITOR_BODY）· 按钮（BTN_PRIMARY / BTN_QUIET / **BTN_DANGER**（灰调红实心，破坏性确认唯一形态）/ ICON_BTN / ICON_BTN_MD / FILTER_TRIGGER）· 输入与字段行（INPUT_LINE / TITLE_INPUT / FIELD_INPUT / **DATE_INPUT**（年/月/日 三段）/ FIELD_ROW / FIELD_LABEL / FIELD_GRID / LIST_END / SEARCH_INPUT / SEARCH_ICON）· 浮层（PANEL / MENU / MENU_ITEM_BASE / MENU_ITEM / MENU_GROUP_LABEL）· 列表（LIST_GRID / ROW_ACTIONS / EMPTY_HINT / MOBILE_FILTER_BTN / CHIP）· 素材卡与节点（MEDIA_CARD / MEDIA_IMG / MEDIA_GRADIENT / MEDIA_FALLBACK / NODE_WRAPPER）· 圆角与空态（ROUND_ITEM / ROUND_CONTROL / ROUND_PANEL、EMPTY_STATE / CENTER_STATE / LOADING_TEXT）
- `src/app/globals.css` — 设计令牌（`--oc-paper/ink/line/hover`、`--oc-danger`（危险按钮的灰调红底色））、**圆角三档**（`--radius-item: 4px` / `control: 6px` / `panel: 8px` → `rounded-item` 等工具类）、`--oc-hover`（全局控件悬停底色）、`--oc-ink-fixed/paper-fixed`（固定底色上的文字）、`.touch-feedback`、`.row-rule`+`.rules-end`（可点整行的直线分隔）
- `scripts/design-audit.ts` — **设计令牌体检**（`npm run audit:design`）：扫全项目找像素圆角 / Tailwind 原色 / 暗色十六进制 / 黑·白半透明底 / 阴影 / 粗描边 / ring 光晕，并列出「重复 ≥3 次、该收进 ui-tokens 的类名串」。确有例外就写 `// design-audit-allow <规则名> 理由`。**提交前跑一次，0 违规才算过**

### 编辑器（全局唯一内核）
- `src/components/editor/EditorCore.tsx` — 统一 Tiptap 实例（含移动端键盘工具栏与块面板）
- `src/components/editor/DocumentEditor.tsx` — 高级封装（加载 document 字段）
- `src/components/editor/mention-render.ts` — `@` 引用下拉（**原生 DOM 渲染器**，挂在 suggestion 生命周期上，刻意不用 React）
- `src/components/editor/BubbleMenuButtons.tsx` — 气泡菜单按钮组
- `src/components/editor/WikiLinkExtension.ts` — [[ 词条内链
- `src/components/editor/extensions/ImageBlock.tsx` — 自定义图片块
- `src/components/editor/extensions/SmallMark.ts` — `<small>` 行内标记（vault 里唯一用到的行内 HTML，保住 Markdown 往返）

### 架构
- `src/features/<domain>/` — 功能模块（characters, events, countries, world, timeline, relations, trash, periods, project, dashboard）
- 每个模块：`index.ts` (barrel) + `types.ts` + `services.ts` + `hooks/` + `components/`
- **实体编辑器统一形态**：`components/<X>Editor.tsx` = 页头 + 头图 + 各 section 组装（约 120–240 行）；表单状态/派生/保存管线放 `hooks/use<X>Form.ts`（返回单个对象，`export type <X>Form = ReturnType<...>`）；字段区拆成 `components/<X>InfoSection.tsx` / `<X>RelationSection.tsx` 等。已按此收口：CharacterEditor / EventEditor / WorldLayout(`useWorldEntryDraft`) / SettingsDialog
- **列表页统一形态**：`components/<X>List.tsx` = 状态 + 过滤派生 + 空态/错误态 + 网格·目录渲染 + 浮层；列表项 `components/<X>ListItems.tsx`（Card/Row 共用 props）、页头 `components/<X>ListToolbar.tsx`、纯函数与偏好读写 `components/<X>-list-utils.ts`。已按此收口：CharacterList / EventList / CountryList
- `src/features/timeline/` — 已按职责分层：`hooks/useTimelineLayout`（纯派生：坐标/泳道/刻度/聚合桶）、`hooks/useTimelineViewport`（滚动/缩放/捏合/导航）、`components/{TimelineToolbar,EventNode,FilterSelect,PeriodBar,BucketView,EmptyTimeline}`、`constants.ts`、`utils.ts`（纯函数）
- `src/features/project/` — 项目元信息（单例 `meta` 表，id 固定为 1）
- `src/lib/world-tree.ts` — **词条树唯一实现**（`buildEntryTree`）。层级只由 `parentId` 表达；编辑器目录与静态站导出共用同一份排序。`parentId` 悬空（父级被删）时该条当根，不消失
- `src/features/dashboard/` — 概览（主页）首屏。世界封面（`meta.coverUrl`，设置 → 世界）就是这一页的头图（`StretchyHeader`，3:2）；没设封面时不占位
- `src/lib/export/` — 导出器：`payload`（.ocbak + 图片内联）/ `markdown` / `download` / `site`（**静态展示站**：`render` 正文→HTML、`styles` 设计令牌、`build` 组装单文件 `index.html`）；`src/lib/export.ts` 只是 barrel
- `src/components/shared/` — 共享组件
- `src/components/ui/` — shadcn/ui 基础组件
- `src/components/layout/` — 布局（AppShell, Sidebar, MenuBar + MenuBarMenus/MenuBarSearch/WindowControls, StatusBar, OverlayRoot, MobileTopBar, MobileTabBar, MobileFilterBar, MobileFab）

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
- `src/lib/settings.tsx` — 主题 / 同步设置
- `src/lib/use-device.ts` — useDevice() (isMobile)
- `src/lib/image-service.ts` — 图片全流程（含 Tauri/Capacitor/Browser 三环境适配）
- `src/lib/image-crop.ts` — Canvas 裁剪引擎（getCroppedBlob 支持 Blob 入参 + HEIF 自动转换）
- `src/lib/image-heif.ts` — HEIF/HEIC 格式检测与转换（isHeif / convertHeifToJpeg，heic-to 封装）
- `src/lib/adapters/capacitor-adapter.ts` — Capacitor 图片持久化适配器
- `src/lib/adapters/local-adapter.ts` — Tauri 本地文件系统适配器
- `src/lib/adapters/browser-adapter.ts` — 浏览器环境图片适配器

### 图片系统组件
- `src/components/shared/ImageUploader.tsx` — 通用上传（支持裁剪流水线）
- `src/components/shared/ImageCropper.tsx` — 全屏裁剪 + 缩放滑块（react-easy-crop）
- `src/components/shared/PeriodDialog.tsx` — 时期添加/编辑弹窗
- `src/components/shared/image-gallery/` — 图片画廊：`ImageGallery`(壳/模式分发) + `ImageGallerySlider`(滑动模式) + `ImageGalleryGrid`(网格模式) + `useImageUpload`(选文件→裁剪→落盘)
- `src/components/shared/context-menu/` — 右键菜单内部：`context-menu-types` + `ContextMenuButton`(顶层与子菜单共用的项按钮) + `ContextSubMenu`
- `src/components/shared/FilterSelect.tsx` — 通用筛选下拉（触发按钮 + portal 面板 + 点外关闭），样式由调用点传入
- `src/components/settings/` — 设置弹窗（`SettingsDialog` 壳 + `tabs/{World,General,Data,About}Tab` + `controls` 开关/单选框常量 + `credits.ts` 关于页的开源致谢清单）。「数据」页签 = 原数据 + 云合并；**AI 页签已删除**（见约束 15）
- `src/components/shared/ProfileBannerEditor.tsx` — 头图+头像编辑（头图由 `StretchyHeader` 承载）
- `src/components/shared/StretchyHeader.tsx` — **弹性头图容器**：下拉放大（框跟着长高、头图等比放大所以不变形，左右多出来的被裁、上下不裁；含 Windows/Android 无原生回弹时的合成量）、滚动折叠、折叠视差。rAF 直写 style、不进 state；`prefers-reduced-motion` 下整体关闭。滚动容器按最近的 `overflow-y: auto` 祖先自动找
- `src/components/shared/FullscreenViewer.tsx` — 全屏查看

### Vault（文件夹设定集，仅桌面 Tauri）
**文件是真源，且是唯一真源**：一个文件夹 = 一套设定集（界面上叫**「笔记库」**），词条存成 Markdown + frontmatter，可用 Obsidian 直接打开。
文案分工：指代「你这个世界观」时叫**笔记库**（引导页 / 报错 / 设置）；让用户去点系统对话框时叫**本地文件夹**（`打开本地文件夹…` / `新建本地文件夹…`）。代码里仍然叫 vault，**两边只有这一条对应关系，别改标识符**。
**没有第二种数据源**：Dexie 只是本次会话的工作缓存，退出即散；「内置数据库模式」已废弃（仅在浏览器里作为 Mock 预览保留，右下角有 `DEV · Mock` 标）。备份格式**只有 `.ocbak`**（原名沿用），新旧差异由文件里的 `version` 字段在后端判断，不做第二套格式。单真源迁移方案见 `docs/迁移计划.md`。
- `src-tauri/src/vault.rs` — 自建文件 IO 命令（probe/scan/write_texts/write_bytes/import_file/read_bytes/move/remove/mkdir/exists）。**不用 JS 的 fs 插件**：那要在运行时给 fs scope 授权并跨重启持久化。含原子写（临时文件 + rename）、mtime 乐观并发、路径逃逸拦截、BOM 剥离、`spawn_blocking`（同步命令会卡死主线程）。带 **6 个单测**（含 IPC 线格式契约 —— 字段名改错不报错，只会静默变 `undefined`）
- `src-tauri/src/open.rs` — 用系统默认程序打开外链（`rundll32` / `open` / `xdg-open`，**不经过 shell**，只放行 http(s)），2 个单测
- `src-tauri/src/files.rs` — 导出落盘命令 `save_text(path, content)`：WebView2 里 `<a download>` 不可靠（桌面版导出会「点了没反应」），所有导出改走「系统保存对话框拿绝对路径 → Rust 写入」，同目录临时文件 + rename，3 个单测
- `docs/迁移计划.md` — 单真源迁移的施工蓝图（术语、备份只剩 `.ocbak`、老数据迁移的三个深坑、验收清单、已取消的 ocpack 方案）
- `src/lib/vault/types.ts` — 扫描输入 / 笔记 / 数据集 / 索引 / 报告类型
- `src/lib/vault/frontmatter.ts` — **外科式**读写：只替换我们拥有的键、只替换正文，键顺序与注释原样保留
- `src/lib/vault/fields.ts` — frontmatter 词汇表**唯一源**（键链）。读与写共用，从结构上消除导入器/导出器漂移
- `src/lib/vault/scan.ts` — 文件集 → 数据集 + 解析索引 + 体检报告（纯函数，不动磁盘）
- `src/lib/vault/serialize.ts` — 实体 → frontmatter 更新。三条硬规则：**未改动就不写**（带装载快照）、**跟文件已有的键名走**（保留 `阵营`/`所属国家` 这类中文键）、**从不整体重写**
- `src/lib/vault/markdown/` — Tiptap JSON ⇄ Markdown 双向桥（`doc` / `to-tiptap` / `to-markdown`）。无法无损表达的节点附 ` ```oc-document ` 兜底块
- `src/lib/vault/markdown-bridge.ts` — 解析层与 Markdown 层的粘合剂；唯一知道「哪种实体的正文在哪个字段」的地方（**词条在 `content`，其余在 `document`**）
- `src/lib/vault/vault-fs.ts` — Tauri 命令的 TS 门面（含 `isVaultSupported()`）
- `src/lib/vault/vault-load.ts` — 读盘 + 建会话 + 整库替换 Dexie（**挂起落盘**）
- `src/lib/vault/vault-persist.ts` — 落盘队列：挂在 **Dexie dbcore 中间件**上，`dbcore.table().mutate` 是所有写入的唯一入口，一处接线覆盖全部写入路径；只在事务外做 IO；**绝不静默删除文件**（`deleteRange` 一律忽略）。主键要**同时**看 request 的 `keys` 与 response 的 `results` —— 不带 id 的 `add`/`bulkAdd` 只有在 response 里才拿得到自增主键，漏了它新行永不落盘；单条序列化失败只记错并把该行留在队列，不连坐整批
- `src/lib/vault/export-dir.ts` — **老数据 → 文件夹**的全量物化（笔记 + 图片 + `tags.json` + `fields.json` + 标记文件）。只写不删、目标必须是空文件夹；`scripts/vault-migrate-check.ts` 是它的内存闭环自检
- `src/lib/vault/vault-paths.ts` — 路径分配（纯函数）：Windows 非法字符、保留设备名、撞名去重、回收站路径
- `src/lib/vault/vault-session.ts` / `vault-registry.ts` / `vault-tags.ts` / `vault-marker.ts`
- `src/lib/vault/vault-migrate.ts` — 把应用数据目录里的存量图片迁进 vault 并改写引用。**显式动作**（菜单里点），不自动执行 —— 它要往用户文件夹里写文件
- `src/lib/vault/vault-provider.tsx` — 上下文。状态是**派生**的（`useSyncExternalStore` 读环境）：`isVaultSupported()` 服务端为 false，直接做 useState 初值会造成水合不一致
- `src/features/vault/` — UI（`VaultGate` 启动闸门 / `VaultWriteBanner` / `VaultMenuSection` / `VaultStatus` / `VaultSurfaces` / `VaultOverlay` / `VaultScanReportDialog` —— 界面上叫**概览**：一行「N 篇笔记 → 构成」，正常时只说「没有发现问题」，有异常才出现一条「未知 N 项」，点开才是文件清单）
- `scripts/vault-analyze.ts` — 离线体检 + 内存往返验证
- `scripts/vault-frontmatter-check.ts` — 外科式读写原语的**逐字节恒等**检查
- `scripts/vault-body-diff.ts` — 正文往返差异归因（按签名聚合）
- `scripts/vault-write-acceptance.ts` — **文件夹级**验收：复制真实 vault → 三处改动 → sha256 比对全目录，非预期改动必须为 0
- `scripts/vault-markdown-check.ts` — 正文桥自检（定向用例 + 全量幂等 + 文本级归因）
- `scripts/vault-migrate-check.ts` — 老数据迁移的**内存闭环**自检：造旧库 → 物化 → 扫描读回 → 逐字段比对（29 项断言，不需要真实 vault）

**Vault 的验证口径（改这块代码前先跑一遍）**
```
npx tsx scripts/vault-migrate-check.ts                        # 老数据迁移闭环，29 项断言
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
- `src/lib/useLongPress.ts` — 长按 hook（320ms 阈值，8px 移动容差）
- `src/lib/haptics.ts` — Capacitor 触觉反馈封装

### 配置
- `opencode.json` — OpenCode 核心配置
- `.opencode/skills/` — 6 个技能文件（guide, coding, design, codebase, prd, sync）
- `package.json` — 依赖和脚本
- `next.config.ts` — Next.js 配置
- `tsconfig.json` — TypeScript 配置
- `eslint.config.mjs` — ESLint 配置

## 开发命令
```bash
npm run dev       # 开发服务器 (localhost:3000)
npm run build     # 生产构建 (静态导出)
npm run lint      # ESLint
npm run audit:design  # 设计令牌体检（0 违规才算过）
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
   - **阴影**：内容面（卡片 / 按钮 / 输入）零阴影；浮层（菜单 / 下拉 / 右键 / 弹窗 / 抽屉 / 通知）只用唯一一档 `FLOAT_SHADOW`（`float-shadow`，值在 `globals.css`）。禁止 Tailwind `shadow-sm/md/lg` 与自编阴影值，`audit:design` 的 `shadow-literal` 会拦
   - **设置弹窗**：衬线只给弹窗标题（`PAGE_TITLE`），内部一律黑体 —— 分组标题 `text-sm font-medium text-ink`、字段标签 `text-sm text-ink`、说明 `text-xs text-ink-faint`；**动作按钮文字居中**，二级页面入口按列表行两端对齐（文字靠左、`›` 靠右）。细则见 design skill「设置弹窗」
   - 浮层菜单（右键 / 下拉 / 筛选 / @ / / ）一律：容器 `MENU`（只留 `py-1`，**没有左右内边距**）+ 行 `MENU_ITEM_BASE`（自带 `px-3`）—— hover 才能横向铺满、左右不留缝；行高 `py-1`（27px），不要再用 `py-1.5`
   - **禁止原生 `<datalist>` / `type="date"` 这类系统控件**：弹出层由 WebView 自己画、不在 DOM 里，圆角/阴影/宽度/暗色全部够不着（会出来一块跟设计系统无关的灰卡片）。需要「输入 + 建议」就自己写 input + portal 到 `#overlay-root` 的 `MENU` 面板（参考 `FilterSelect`）
   - 主题切换交给 `bg-paper` / `text-ink` 这类令牌本身，**不要再叠 `dark:bg-[#1C1B1A]` 这种十六进制**（等于把令牌抄一遍）
   - 「抬起 / 选中」的浅底色一律 `bg-[var(--oc-hover)]`，不要用 `bg-black/5 dark:bg-white/5`
   - 固定底色色块（时期条 / 标签）上的文字用 `text-ink-fixed` / `text-paper-fixed`（不随主题翻转），配 `isLightColor()` 判断
3. **系统右键菜单**：`GlobalContextMenu` 在 document 上统一拦截 —— 非文本区 `preventDefault()`（不弹 WebView 自带菜单），输入框 / textarea / 可编辑区保留系统菜单
4. **数据层**：Dexie 唯一数据源，通过 hooks 访问，软删除默认启用
5. **编辑器**：复用 EditorCore，不创建新实例
6. **浮层**：必须 Portal 到 `#overlay-root`
7. **代码风格**：TypeScript strict，禁止 `any`，`export function` 导出
8. **移动端布局**：CSS-first 方案（`max-md:hidden`/`md:hidden`），不依赖 `useDevice()` 做壳切换
9. **图标规则**：返回/关闭=ArrowLeft，折叠=ChevronLeft，展开=Menu，统一 `strokeWidth={2}`
10. **模糊效果**：`backdrop-blur` 的 header 必须放在滚动容器内部（非平级兄弟）。同时滚动容器**不得**有 `padding-top`/`padding-bottom`，padding 不参与滚动，内容无法到达 fixed bar 背后。必须用内容内部的透明 spacer div 替代（顶部 `<div className="md:hidden h-[calc(60px+var(--safe-top))]">`，底部 `pb-24`）。
11. **安全区域**：所有移动端固定定位元素使用 `h-[calc(60px+var(--safe-top))] pt-[var(--safe-top))]` 模式（精确高度，非 min-h）。CSS 变量定义在 `globals.css`，Java 层在 `MainActivity.java`
12. **移动端触控反馈**：所有移动端可交互控件必须提供按压反馈，分两层规则：
   - **有边框**（`border border-line`）→ `touch-feedback` class，提供 120ms `scale(0.96)` 缩放反馈
   - **无边框** → `active:bg-[var(--oc-hover)]` 背景高亮反馈
   CSS 定义在 `globals.css` 的 `.touch-feedback` 规则中。例外：MobileTabBar 和 GlobalAlbum 分类切换按钮保持简洁无感
13. **文案节制**：**Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.**（不写多余的次级标签与说明文字，解释交给布局）
   - 标题下不加副标题句、设置项下不加说明、按钮里不加第二行小字；禁用态已由 `opacity-50` / `cursor-not-allowed` 表达，不再补「不可用 / 桌面端支持」；placeholder 不复述标签
   - 只有四类说明可留，且必须**一句话 ≤ 20 字、紧跟被说明的元素**：破坏性后果 / 数据口径 / 隐私安全 / 功能未开放（「开发中」）
   - 不写「注：」「说明：」「提示：」这类散文前缀；`npm run audit:design` 的 `prose-prefix` 规则会拦。完整规则与四问审查表见 `oc-studio-design` skill §9
14. **未保存状态**：唯一口径是「当前值 ≠ 已保存值」（`src/lib/dirty.ts` 的快照签名），表单只**上报** `reportDirty(boolean)`，**不要再手工 `markDirty()`**。手工置位是个只进不出的闩——「输入一个字再删掉」「Ctrl+Z 回到原样」「保存后值被规范化（`3` → `03`）」都会留下抹不掉的脏标记，返回时就弹「有未保存的更改」。正文用 ProseMirror 文档与基线文档 `doc.eq()` 比对，不做文本序列化比较
15. **AI：暂不做，相关代码已删除**（2026-10）：`src/lib/ai/`、`EventAiSummary`、设置里的 `AiTab`、`settings.tsx` 的 `ai*` 字段、`useEventForm` 的概括逻辑**全部移除**，没有开关、没有隐藏入口。**不要再加 AI 入口、不要恢复旧代码、不要在文案里承诺 AI 能力**；要做得当成新功能重新设计。产品口径见 `oc-studio-prd` skill §1

## 已知差异（技术债，待后续修复）
- **解耦已收口**：无「真·God 组件」。`≥300 行` 仅剩已抽出的层/壳：`lib/use-entity-workspace.ts`（编排层）、`features/timeline/components/TimelineView.tsx`（壳+画布 JSX）、`features/world/components/WorldLayout.tsx`（壳+编辑区 JSX）、`features/timeline/hooks/useTimelineViewport.ts`、`lib/seed/index.ts`（播种脚本）—— **再拆就是为拆而拆，不要动**
- 仓储层（`lib/repository.ts`）的 `Table<T, number, TInsert>` 第 3 个泛型位、实体 `id: number` 必填、`EntityTable` 的用法是**互相咬合**的：省掉第 3 个泛型位会让 `listActive` / `getById` 的返回值被推断成「id 可选」，从而在全项目催生 `as number` 断言。改动前先读 `src/lib/repository.ts` 顶部注释

## 待办与改进清单
- 详见 `todo.md`（界面交互设计建议 / 技术重构 / 已知技术债，按 P0–P3 优先级维护）
