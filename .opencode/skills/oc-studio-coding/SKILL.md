---
name: oc-studio-coding
description: >
  OC Studio 编码规范。定义架构与文件组织、数据与状态管理、组件开发标准、样式与触控规则、
  响应式适配、编辑器扩展、z-index 层级规范。所有代码生成必须遵循。
  触发词：编码规范、架构、数据层、组件规范、编辑器扩展、响应式。
---

# AI 开发技能规范 (Coding Skills)

> 本文件是 AI 在编写 OC Studio 项目代码时的行为准则。所有生成代码必须符合以下规则。

## 1. 架构与文件组织
- 功能模块位于 `src/features/<domain>/`，每个域内有 `types.ts`、`services.ts`、`hooks/`、`components/`。
- 模块必须通过 `index.ts` 暴露公共接口，**严禁直接跨模块引用内部文件**。
- 共享组件放 `src/components/shared/`，使用 Props 驱动，不持有业务逻辑。
- shadcn/ui 生成的基础组件放 `src/components/ui/`，全局可复用。

## 2. 数据与状态
- **单一数据源**：所有读写必须走 Dexie (`src/lib/db.ts`)。只能通过自定义 Hook 访问，组件内不得直接调用 `db.table`。
- **异步优先**：所有 Dexie 操作必须使用 `async/await`，禁止 `.then()`。
- 服务器状态用 TanStack Query，仅用于同步逻辑；UI 暂态用 React Context。
- **列表/详情数据一律用 React Query**（useQuery/useMutation），四个实体模块已全部统一：列表 staleTime 30s + `DATA_UPDATED_EVENT` 刷新；详情 staleTime 0（跨模块写入后重挂载必须读到新值）。禁止再引入 `useState + refreshKey` 手写加载。
- **每次写操作必须自动记录操作日志** (`operationLog` 表)，通过 `src/lib/sync.ts` 中的 `logOperation()`；`_syncStatus`/`_lastModified` 统一经 `pendingStamp(now)` 生成。
- **软删除**：删除行为必须设置 `deleted: true`，不得物理删除记录。回收站中的永久删除是唯一例外。标准实体软删除走 `repository.ts` 的 `softDelete()`。

### Vault 模式（仅桌面 Tauri）：文件是真源
打开文件夹后，实体以 Markdown + frontmatter 落盘，Dexie 是**内存缓存**（重启由文件夹重建）。规则：

- **落盘挂在 Dexie `dbcore` 中间件上**（`lib/vault/vault-persist.ts`）：`dbcore.table().mutate` 是所有写入的唯一入口，一处接线覆盖 service CRUD / 批量导入 / 引用回写 / 回收站还原 / 拖拽排序 / 草稿自动保存。**新增写路径不要逐个 hand-wire**。
- **只在事务外做 IO**：中间件里只记「(表, id) 脏了」，读行 / 序列化 / 写文件都在防抖后的异步 flush 里做（Dexie 事务可能回滚）。
- **绝不静默删除文件**：`deleteRange`（`clear()`）一律忽略 —— 批量导入的 `replace` 会 clear 全表。单个删除只走「移入回收站」，真正删文件仅发生在「回收站里彻底删除」。
- **未改动就不写 / 从不整体重写**：写回按**文档结构**比较（带装载快照），不是按正文文本比较；这是「不弄脏用户文件」的关键。
- **frontmatter 必须外科式**（`lib/vault/frontmatter.ts`）：只替换我们拥有的键、只替换正文，键顺序与注释原样保留；键名**跟文件已有的走**（保留 `阵营`/`所属国家` 这类中文键）。键链唯一源是 `lib/vault/fields.ts`（读与写共用）。
- **图片引用只走 `lib/image-refs.ts`**：字段图（头像 / 立绘 / 封面 / 图集 / 旗帜 / 世界封面）与正文 `imageBlock.src` 都由它收集，相册、`.ocbak` 备份、老数据落地三处共用。**不要在任何地方再手写遍历文档找 `imageBlock`** —— 三处各写一套的直接后果是「相册看不见正文图 / 备份少一半图」，而且不报错。
- **整库替换要包 `suspend`**：装载 vault、批量导入这类操作必须包起来，否则成千上万次中间态会写进用户文件夹。
- 正文位置：**词条在 `content`，其余实体在 `document`**；只有 `lib/vault/markdown-bridge.ts` 知道这件事。
- Vault 是**跨域基础设施**，因此放 `src/lib/vault/`（不是 `features/`）；界面在 `src/features/vault/`。

### 数据库 Schema（Dexie 4 · schema v6 · 8 张表）
| 表 | 主键 | 索引字段 |
|----|------|----------|
| `characters` | `++id` | `name`, `race`, `element`, `occupation`, `nationalityLegacy`, `countryId`, `isMajor`, `deleted`, `_syncStatus` |
| `events` | `++id` | `title`, `time`, `parentEventId`, `isMajor`, `deleted`, `_syncStatus` |
| `countries` | `++id` | `name`, `parentId`, `deleted`, `_syncStatus` |
| `worldEntries` | `++id` | `title`, `category`, `parentId`, `deleted`, `_syncStatus` |
| `periods` | `++id` | `startTime`, `deleted` |
| `tags` | `++id` | `name`, `category` |
| `operationLog` | `++id` | `timestamp`, `targetType`, `targetId` |
| `meta` | `id`（非自增，单例固定 `1`） | — |

所有实体表包含 `_syncStatus`、`_lastModified`、`deleted` 字段。

**表类型必须写成 `EntityTable<T, 'id'>`**（Dexie 4）：
- 读出的行 `id` 是 `number`（因此组件里不需要 `id as number`）
- 写入时 `id` 可省略（由 Dexie 生成）
- 新增表 / 改类型时照此声明；实体接口里 `id` 是**必填** `number`

仓储原语（`lib/repository.ts`）的签名是 `Table<T, number, TInsert>`：**第 3 个泛型位不可省**。
若省掉（写成 `Table<T, number>`），TS 会把推断出的 `T` 统一成 `InsertType`（写入态），
导致 `listActive` / `getById` 的返回值被判定成「id 可选」，从而在全项目催生 `as number` 断言。

## 3. 组件开发规范
- 文件命名：`PascalCase.tsx`，组件名与文件名一致。
- 每个文件只导出一个主组件，使用 `export function`（非箭头函数）。
- Props 必须定义接口并导出。
- 所有数据依赖组件必须处理 `Loading`、`Empty`、`Error` 三种状态。
- 纯展示组件（无状态）优先使用 React Server Components（不写 `'use client'`）。
- 交互组件使用 `'use client'`，内部状态最小化，逻辑用自定义 Hook 收拢。
- **尺寸**：页头与工具栏控件统一 `h-8`；页头内图标按钮 `h-6`；窄栏/页头内输入 `h-6`。**不存在 `h-9` 控件**。
- **类名来源**：一律取 `src/lib/ui-tokens.ts`（`BTN_PRIMARY` / `BTN_QUIET` / `ICON_BTN` / `INPUT_LINE` / `PANEL` / `MENU` / `MENU_ITEM` / `FIELD_ROW` / `PAGE_TITLE` / `SECTION_TITLE` / `CHIP` / `EMPTY_STATE`），**不要就地拼写类名**
- **全局按钮 hover**：所有 button 通过 `@layer base` 继承 `background-color: var(--oc-hover)`；因此整行按钮必须自带横向 padding（或用「行 `px-*` + 外层负 margin」）
- **页头统一 48px**：`h-12 border-b border-line bg-paper/85 dark:bg-[#1C1B1A]/85 backdrop-blur-lg`（列表页 `px-6`，编辑器 `px-4`），标题用 `PAGE_TITLE`（18px 衬线加粗）
- 页面外层 `flex flex-col min-h-full`（非 `h-full`），内容区 `flex-1`（无 `overflow-auto`，由 `<main>` 统一滚动）
- **浮层强制 Portal**：所有下拉菜单、筛选面板、弹窗必须通过 `createPortal` 渲染到 `#overlay-root`。禁止在顶栏（含 `backdrop-blur` 合成层）内部使用 `absolute` 定位浮层。
- **禁止浏览器原生的弹出型控件**：`<datalist>`、`<input type="date">`、`<select>` 的弹层由 WebView 自己绘制（不在 DOM 里、CSS 够不着、暗色下仍是一块浅灰）。需要建议列表 / 日期选择就自己写「input + portal 的 `MENU` 面板」，参考 `FilterSelect`。

## 4. 样式与触控
- **强制使用 Tailwind 类名**，禁止内联样式。例外：动态坐标/尺寸等无法用 Tailwind 表达的场景可用 `style`。
- 颜色必须使用设计令牌，**禁止硬编码色值**。详细令牌见 `oc-studio-design` skill。
- 下拉菜单/筛选面板选项 hover：`hover:bg-[var(--oc-hover)]`（全局统一的极低透明度墨色，亮暗自适应）
- **极小圆角**（只有 4 / 6 / 8 三档，仅头像/徽章为圆形；见 `oc-studio-design` skill 的 item / control / panel）、**全程无阴影**（不写 `shadow-*`，卡片悬停改底色）；控件的边框规则见 `oc-studio-design` skill
- 图标统一用 `lucide-react`，`strokeWidth={2}`，尺寸 16px(桌面)/20px(移动)
- **旧内核 backdrop-blur 降级**：`isBelowTargetVersion()` 为 true 时 `AppShell.tsx` 设 `data-below-target-version` 属性到 `<html>`，`globals.css` 中 `[data-below-target-version] .backdrop-blur-lg` 统一禁用 `backdrop-filter` + 背景改不透明（亮 `#FEFCF8` paper / 暗 `#1C1B1A` dark-bg）。组件无需任何改动。
- **图标语义规则**：返回/关闭 = `ArrowLeft`，折叠（收起侧边栏）= `ChevronLeft`，展开（打开侧边栏）= `Menu`。桌面端折叠按钮：树可见时 `ChevronLeft`，树隐藏时 `Menu`
- 触控区域：所有可点击元素最小热区 44x44px，通过 `padding` 或伪元素保证

## 5. 响应式与设备适配
- 使用封装的 `useDevice()` hook（位于 `src/lib/use-device.ts`）判断 `isMobile`。
- **布局壳切换采用 CSS-first 方案**：`max-md:hidden md:block`（桌面壳）/ `md:hidden`（移动壳），不依赖 `useDevice()` 做条件渲染。`useDevice()` 仅用于运行时行为（拖拽禁用、长按、触控热区）。
- 桌面端：侧边栏默认 140px，可拖 112–168px（常量在 `src/lib/sidebar-width.ts`）；外壳之间不画线，内容区只用 `border border-line` 的面板边界。
- 移动端：禁用拖拽功能，用长按菜单或按钮替代；编辑器只保留加粗、斜体、标题按钮；侧边栏隐藏，通过底部导航或手势呼出。
- **Tailwind v4 注意**：`hidden` 类可能不生成 CSS，用 `max-md:hidden` 替代。
- **移动端布局层级**：MobileTopBar `fixed top-0` (z-20) → MobileFilterBar `fixed top-[60px]` (z-30) → 内容区 → MobileTabBar `fixed bottom-0` (z-30)
- **移动端滚动容器规则**：外层统一滚动容器（section-fade）**不得**设置 `padding-top`/`padding-bottom`（padding 不在滚动内容区，内容无法经过 fixed bar 背后→无模糊）。必须用内容内部的透明 spacer div 代替：顶部 `<div className="md:hidden h-[calc(60px+var(--safe-top))]" />`，底部 `pb-24`（≥ tab bar 高度）或 `<div className="md:hidden h-[calc(60px+var(--safe-bottom))]" />`。
- **编辑页移动壳隐藏**：`AppShell` 通过 `useEditor().isEditing` 控制 MobileTopBar/MobileTabBar 显隐，`main` 的 `max-md:pt` 在编辑时归零
- **键盘适配**：
  - Android `adjustNothing`（WebView 不缩放），body `h-screen`（非 `h-dvh`，防止布局重算），编辑器 flex-1 子元素必须加 `min-h-0`（防止 flex child 拒绝缩小）
  - **键盘高度计算**（`KeyboardContext.tsx`）：
    - 现代内核（Chromium ≥114）：`window.innerHeight - visualViewport.height`，`resizeOnFullScreen` 下 WebView 自动收缩，差值即为键盘高度
    - 旧内核（Chromium <114，`isBelowTargetVersion()`）：`visualViewport` 不可靠（键盘弹出后不变），改用 `@capacitor/keyboard` 插件的 `keyboardDidShow` 事件 payload `keyboardHeight`（原生 WindowInsets），扣掉 `--safe-bottom` 导航栏高度 + 微调偏移
    - 光标/滚动计算统一用 `document.documentElement.clientHeight`（与 `innerHeight` 始终同步）
  - **键盘弹出策略**：**禁止** `virtualkeyboardpolicy="manual"` 和手动 `Keyboard.show()`。contenteditable 聚焦时 Android 原生 IME 路径自动弹出键盘（warm ~80ms, cold ~230ms），Capacitor `Keyboard.show()` bridge 往返额外增加 ~360ms 延迟
  - **长按检测**：`touchstart` 非 passive + `preventDefault()` 阻止浏览器自动聚焦 contenteditable；tap 时在 `touchend` 通过 `setTimeout` 延迟检查 `!editor.isFocused`，未聚焦时用 `editor.view.dom.focus()` 补救（避免 `editor.commands.focus()` 覆盖浏览器原生触控光标定位）；长按/滚动时不聚焦，键盘不会闪现
  - 移动端键盘工具栏通过 `KeyboardContext` 精确定位，`paddingBottom: var(--safe-bottom)` 消化导航栏高度（与 `MobileSearchOverlay` 保持一致）
- **侧边栏固定不滚动**：分栏布局中侧边栏用外层 `sticky overflow-hidden` + 内层 `overflow-auto` 两层解耦

## 6. AI（暂不做）
- 2026-10 已删除全部 AI 代码与入口：`src/lib/ai/`、`EventAiSummary`、设置里的 AI 页签、`settings.tsx` 的 `ai*` 字段、`useEventForm` 的概括逻辑。
- **不要恢复旧实现、不要新增 AI 入口、不要在文案里承诺 AI**；要做得当成新功能重新设计。

## 7. 编辑器扩展
- TipTap 为全局内核，自定义节点必须注册在同一实例上。
- 新增内容模块时，禁止创建新的编辑器实例。必须复用 `src/components/editor/EditorCore`。
- 通过 props（如 `onReady`、`content`、`placeholder`）适配不同模块的需求。
- 特殊块：`[[` 触发词条内链、`@` 触发角色引用。
- 编辑/浏览模式切换时，禁止重建编辑器实例，仅切换 `editable` 和 UI 控件显隐。

## 8. 通用原则
- TypeScript strict 模式，禁止 `any`。
- 条件渲染优先用三元运算符，避免 `&&`（防 falsy 渲染）。
- 所有数据变更必须立即写入 Dexie + 更新操作日志，无网络依赖。
- 代码必须通过 ESLint 规则：`no-restricted-imports`（禁止跨域内部引用）、`import/no-cycle`。

## 9. z-index 层级与浮层诊断

### 层级规范
```
#overlay-root  z-index: 999999  ← 所有 Portal 浮层
  MobileActionSheet    z-[60]   ← iOS 风格底部弹出菜单
  MobileTextSelectionBar z-50  ← 移动端选词工具栏
  浮层面板      z-30            ← 下拉菜单、筛选面板
  子菜单        z-50            ← 右键子菜单、嵌套下拉
  顶栏          z-10            ← sticky toolbar
  内容区        auto            ← 不设置 z-index
```

### 快速诊断清单
1. 浮层不显示 → 检查 Portal 容器 `#overlay-root` 是否存在、`display:none`/`opacity:0`
2. 位置不对 → `absolute` vs `fixed`，确认相对父级还是视口
3. 无法点击 → 祖先 `pointer-events:none`，浮层面板需显式 `pointer-events-auto`
4. backdrop-blur 模糊无效 → **两种原因**：(A) header 不在滚动容器内部（平级兄弟），将 `sticky` header 和内容同置于一个 `overflow-auto` 容器内。(B) 滚动容器有 `padding-top`/`padding-bottom` → 内容无法滚入 padding 区域 → fixed bar 背后无内容可模糊 → 移除 padding 改用内部 spacer div。
5. 被遮挡 → 先删多余的 z-index/relative/transform，再考虑 Portal 到 `#overlay-root`
6. hover 不触发 → Portal 后 `mouseenter` 不触发，用全局 `mousemove` + `getBoundingClientRect()` 坐标检测

## 10. 关键文件地图

| 文件 | 职责 |
|------|------|
| `src/lib/db.ts` | Dexie 数据库定义（**schema v6**），**8 张表**（含单例 `meta`）；表类型为 `EntityTable<T,'id'>` |
| `src/types/index.ts` | 全局 TypeScript 类型定义（实体 `id: number` 必填） |
| `src/lib/ui-tokens.ts` | **界面原子类唯一源**（字段行 / 标题 / 按钮 / 输入 / 浮层 / chip / 空态）—— 改 UI 必读 |
| `src/lib/sync.ts` | 操作日志记录（`logOperation`）、统一待同步时间戳（`pendingStamp`） |
| `src/lib/repository.ts` | 泛型 CRUD 仓储原语：`listActive` / `getById` / `softDelete`（签名 `Table<T, number, TInsert>`，第 3 个泛型位不可省） |
| `src/lib/env.ts` | 运行环境检测唯一权威实现：`isTauri` / `isCapacitor` / `isNativePlatform` / `isMobilePlatform` |
| `src/lib/version.ts` | 版本号单源（读取 package.json） |
| `src/lib/data-events.ts` | 跨模块数据变更通知（`DATA_UPDATED_EVENT` + `notifyDataUpdated()`） |
| `src/lib/reference-registry.ts` | @ 引用和 [[ 内链的数据源注册 |
| `src/lib/use-device.ts` | useDevice() hook |
| `src/lib/editor-context.tsx` | ActiveEditorProvider，追踪当前聚焦的编辑器 |
| `src/lib/settings.tsx` | SettingsProvider，主题 / 同步设置 |
| `src/lib/image-service.ts` | 图片上传、URL 解析、blob 持久化 |
| `src/lib/image-crop.ts` | Canvas 裁剪引擎（getCroppedBlob / getCroppedDataUrl / createCroppedCanvas） |
| `src/lib/image-heif.ts` | HEIF/HEIC 格式检测与转换（isHeif / convertHeifToJpeg），heic-to 库封装 |
| `src/lib/browser-compat.ts` | 浏览器/设备检测：Chromium 版本、HarmonyOS 厂商、安全区域降级估算与修正 |
| `src/lib/adapters/browser-adapter.ts` | 浏览器环境图片适配器（<input type="file"> + blob URL） |
| `src/lib/adapters/capacitor-adapter.ts` | Capacitor 图片适配器（<input type="file"> + Filesystem.writeFile 持久化） |
| `src/lib/adapters/local-adapter.ts` | Tauri 图片适配器（原生文件对话框 + appDataDir 持久化） |
| `src/lib/export.ts` | JSON 导出（.ocbak 格式） |
| `src/lib/import.ts` | JSON 导入，4 种合并策略 |
| `src/lib/vault/vault-provider.tsx` | Vault 上下文：打开哪个文件夹 / 装到哪一步 / 写盘是否顺利（状态用 `useSyncExternalStore` 派生） |
| `src/lib/vault/vault-load.ts` | 读盘 + 建会话 + 整库替换 Dexie（挂起落盘） |
| `src/lib/vault/vault-persist.ts` | 落盘队列：挂 Dexie `dbcore` 中间件；只在事务外 IO；`deleteRange` 忽略；`suspend` / `flush` |
| `src/lib/vault/scan.ts` | 文件集 → 数据集 + 解析索引 + 体检报告（纯函数，不动磁盘） |
| `src/lib/vault/frontmatter.ts` / `fields.ts` / `serialize.ts` | 外科式 frontmatter 读写 / frontmatter 词汇表唯一源 / 未改动就不写 |
| `src/lib/vault/markdown/` + `markdown-bridge.ts` | Tiptap JSON ⇄ Markdown 双向桥（`oc-document` 兜底块）；唯一知道正文字段位置的地方 |
| `src/lib/vault/vault-fs.ts` | Tauri 文件命令的 TS 门面（含 `isVaultSupported()`） |
| `src/lib/vault/vault-paths.ts` | 路径分配（纯函数）：Windows 非法字符 / 保留设备名 / 撞名去重 / 回收站路径 |
| `src/lib/vault/vault-migrate.ts` | 存量图片迁进 vault 并改写引用（**显式动作**，不自动跑） |
| `src/features/vault/` | UI：`VaultGate` / `VaultWriteBanner` / `VaultMenuSection` / `VaultStatus` / `VaultSurfaces` / `VaultOverlay` / `VaultScanReportDialog`（界面上叫「概览」） |
| `src-tauri/src/vault.rs` | 自建文件 IO 命令（原子写 / mtime 乐观并发 / 路径逃逸拦截 / BOM 剥离 / `spawn_blocking`），带 6 个单测；另 `src-tauri/src/open.rs` 用系统浏览器打开外链（2 个单测） |
| `scripts/vault-*.ts` | 验收脚本：analyze / frontmatter-check / write-acceptance / markdown-check / body-diff |
| `src/components/editor/EditorCore.tsx` | 统一编辑器内核（含移动端键盘工具栏与块面板） |
| `src/components/editor/mention-render.ts` | `@` 引用下拉的原生 DOM 渲染器（挂在 TipTap suggestion 生命周期上，刻意不用 React） |
| `src/components/editor/editor-mobile-events.ts` | 移动端工具栏经 CustomEvent 下发的 `mobile:*` 编辑命令绑定 |
| `src/components/shared/mobile-text-selection/` | 移动端选词工具栏分层：`constants` / `geometry`（纯函数）/ `clipboard` / `useMobileSelectionState`（状态机 + 计时器）/ `useMobileSelectionEvents` / `useMobileSelectionActions` |
| `src/features/<domain>/hooks/use<X>Form.ts` | 实体编辑器表单：字段状态 / 派生 / 脏标记 / 保存管线（Character · Event · Country 三套同形；World 见 `useWorldEntryDraft`） |
| `src/features/<domain>/components/<X>ListItems.tsx` / `<X>ListToolbar.tsx` | 列表页条目（Card/Row 共用 props）与页头（搜索 / 筛选 / 排序视图 / 新建） |
| `src/components/shared/image-gallery/` | 图片画廊：壳 + `ImageGallerySlider` / `ImageGalleryGrid` + `useImageUpload`（选文件→可选裁剪→落盘） |
| `src/components/shared/FilterSelect.tsx` | 通用筛选下拉（样式由调用点传入；行为只有一份） |
| `src/lib/export/` | 导出器：`payload`（.ocbak + 图片内联）/ `markdown` / `download`（含 Capacitor 适配）/ `site`（静态展示站：`render` 正文→HTML、`styles` 设计令牌、`build` 组装单文件 `index.html`）；`src/lib/export.ts` 只是 barrel |
| `src/features/world/hooks/useWorldEntryDraft.ts` | 词条草稿 → 落库管线（2s 防抖 + 切词条 / beforeunload flush） |
| `src/lib/world-tree.ts` | **词条树唯一实现**（`buildEntryTree`）：层级只由 `parentId` 表达，编辑器目录与静态站导出共用；`parentId` 悬空时当根处理 |
| `src/components/editor/BubbleMenuButtons.tsx` | 气泡菜单按钮组 |
| `src/features/timeline/hooks/useTimelineLayout.ts` | 时间线纯派生层：坐标 / 泳道 / 刻度 / 聚合桶 / 时期行（无状态无副作用） |
| `src/features/timeline/hooks/useTimelineViewport.ts` | 时间线视口层：滚动 / 缩放（滑杆·ctrl+滚轮·双指捏合）/ 上下一件导航 |
| `src/features/project/` | 项目元信息（单例 `meta` 表，id 固定 1） |
| `src/features/dashboard/` | 概览（主页）首屏 |
| `src/components/editor/DocumentEditor.tsx` | EditorCore 的高级封装，加载 document 字段 |
| `src/components/layout/AppShell.tsx` | 根布局壳：MenuBar + Sidebar + main + StatusBar + MobileTopBar + MobileTabBar |
| `src/components/layout/OverlayRoot.tsx` | Portal 目标容器 |
| `src/components/layout/NavigationSourceContext.tsx` | 导航来源追踪 |
| `src/components/layout/MobileNavigationContext.tsx` | 移动端两层导航（section + gallerySubTab） |
| `src/components/layout/MobilePageHeaderContext.tsx` | 移动端页面顶栏标题+动作注册 |
| `src/components/layout/MobileFilterBar.tsx` | 移动端筛选菜单栏 |
| `src/components/layout/MobileFab.tsx` | 移动端视图切换浮动按钮 |
| `src/components/shared/ContextMenu.tsx` | 通用右键菜单 |
| `src/components/shared/GlobalContextMenu.tsx` | 全局文本编辑右键菜单 |
| `src/features/relations/components/MobileRelationControls.tsx` | 关系图移动端控件解耦组件 |
| `src/components/layout/EditorContext.tsx` | EditorProvider + useEditor()（编辑状态上下文） |
| `src/components/layout/TrashOverlayContext.tsx` | TrashOverlayProvider（回收站浮层开关） |
| `src/lib/KeyboardContext.tsx` | KeyboardProvider + useKeyboard()（Capacitor 键盘状态，clientHeight 计算高度，scrollElementIntoView 滚动跟随） |
| `src/lib/useBackButton.ts` | Capacitor 系统返回键处理 |

## 11. 已知技术债（不在此次重构中修复）
- 仍存 4 处 `as number | undefined`：均为**外部无类型边界**（dnd-kit `data.current`、react-flow `node.data`、自定义事件 `detail`、ProseMirror `node.attrs`），属边界适配而非类型谎报，**不要**为了让它们消失而改回强类型断言
- 组件拆分已解耦收口：`src/app/page.tsx` **770 → 272**（抽出 `lib/use-entity-workspace.ts`）；`EditorCore.tsx` **1041 → 277**（`editor-config` / `editor-context-menu` / `mention-render` / `BubbleMenuButtons` / `MobileEditorToolbar` / `editor-mobile-events` / `useEditorBubbleMenu` / `useEditorMobileInput`）。全项目**已无「真·God 组件」**：`≥300 行` 仅剩已抽出的层或壳（编排层 / 画布与编辑区 JSX / 视口层 / 播种脚本），**不要为拆而拆**
