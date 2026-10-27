---
name: oc-studio-design
description: >
  OC Studio 设计系统（寂静工作台）。定义设计理念、色彩/字体/间距令牌、所有原子组件样式约束、
  暗黑模式规范、图标和数据可视化风格、动画规范。所有 UI 生成必须遵循此文件。
  触发词：设计系统、UI规范、样式、颜色、组件样式、暗黑模式、图标、动画。
---

# OC Studio 设计系统（寂静工作台）

## 1. 设计理念
- **绝对寂静**：界面退后至无形，色彩仅属于创作者内容。界面只用暖灰白。
- **极小圆角 · 零描边**：圆角只到 3–8px（`rounded-item/media/menu/panel`），除圆形头像/徽章外**不做胶囊、不做大圆角**；控件**零描边**（输入只留一条底线）。
  线只出现在四个地方：**区块之间 / 表格行 / 浮层边界 / 空态占位框**。传递克制、严谨的秩序感。
- **内容优先**：编辑器/内容区内允许使用用户自定义色卡，但 UI 框架必须保持无色。

## 2. 设计令牌

### 色彩（亮色模式）
- **基底**：`paper` #FEFCF8 (主背景)、`paper-alt` #FAF7F2 (侧边栏)、`paper-card` #F3EFE9 (卡片/输入框底)
- **边框**：`line` #E7E3DC (默认)、`line-hover` #D6D0C4 (悬停/焦点)
- **文字**：`ink` #2B2B2B (主文)、`ink-muted` #6E6A63 (辅助)、`ink-faint` #A5A098 (占位/禁用)
- **状态色（仅三种）**：
  - 错误：`error` #B36651 —— 破坏性按钮的**实心底色**（`bg-error text-paper`）与错误文字（`text-error`）
  - 警告：`warning` #C68D44 —— 只用于文字/图标强调（如「未保存」），不做底色
  - 成功：`success` #A5A098 —— 灰色，只用于文字/图标

### 色彩（暗黑模式）
- `dark-bg` #1C1B1A (背景)
- `dark-panel` #242321 (面板)
- `dark-card` #2D2B28 (卡片)
- `dark-ink` #E3DFD8 (文字)

### 字体
- 正文：Inter, 400, 15px, 行高 1.6
- 标题只有两档（唯一实现见 `src/lib/ui-tokens.ts`）：
  - `PAGE_TITLE` = `text-lg text-ink font-serif font-bold tracking-[-0.01em]`（**18px 衬线加粗**）—— 页面标题 / 编辑器页头 / 弹窗标题 / 回收站 / 相册 / 时间线 / 概览的世界名，全部同一档
  - `SECTION_TITLE` = `mb-3 font-serif text-[15px] font-bold tracking-[-0.01em] text-ink`（**15px 衬线加粗**）—— 表单内区块小标题（基本信息 / 关联 / 正文 / 立绘 / 相册 / 主要角色 …）
- 实体名输入框（角色名、事件标题、词条标题）用 18px 衬线，与 `PAGE_TITLE` 同规格
- **禁止使用纯黑 (#000)**

### 间距与尺寸
- 基础栅格 4px。内边距：8/12/16px，元素间隙：8/12/16/24px
- 触控最小目标 44px
- 卡片内边距 `p-3`，元素间距 `gap-3`
- 编辑页区块间距 `space-y-8` (32px)
- 列表行 `px-4 py-3`

### 圆角与阴影
- **极小圆角**：圆角只用来表达「这是一个整体」，不做胶囊、不做大圆角。四个语义名（唯一源在 `globals.css` 的 `@theme`）：

  | 令牌 | 值 | 用在 |
  |---|---|---|
  | `rounded-item` | 3px | 菜单行 / chip / 图标按钮 / 小控件 / 滑杆 thumb |
  | `rounded-media` | 4px | 卡片 / 图片 / 头图 / 通知 |
  | `rounded-menu` | 6px | 所有弹出菜单（右键 / 下拉 / 筛选 / @ / / ） |
  | `rounded-panel` | 8px | 弹窗 / 大面板 / 底栏抽屉 |

  `--radius: 5px` 供 shadcn 派生的 `rounded-sm/md/lg/xl` 使用（3/4/5/7px），不再做「直角兜底」。
  **禁止写 `rounded-[6px]` 这类像素字面量**，也不要用 `rounded-full` 做胶囊（头像/徽章/圆点除外）。
  业务代码里**不再出现** `rounded` / `rounded-md` / `rounded-lg`（它们是 Tailwind/shadcn 的固定值，会和令牌打架）；一律 `rounded-item/media/menu/panel`。`src/components/ui/` 下也只剩仍在用的基元。
- 唯一例外是**圆形**：角色头像、国家旗帜、头像占位图、关系图里代表头像的图例标记、**颜色色板**（色点）
- 颜色色板：圆形色点 `h-6 w-6 rounded-full`，选中 = `ring-1 ring-ink ring-offset-2 ring-offset-paper`，未选中 `ring-1 ring-transparent hover:ring-line-hover`（不做 2px 粗环）
- **全程无阴影**：不写 `shadow-*`；卡片悬停改**底色**（`hover:bg-[var(--oc-hover)]`）；浮层不加 `ring`

## 3. 原子组件样式

### 按钮
> 类名一律取自 `src/lib/ui-tokens.ts`；本节只描述形态。

- **主按钮** `BTN_PRIMARY`：**浅底实心** `bg-paper-card text-ink h-8 px-3 text-[13px]`，无边框，hover 加深到 `bg-line`。**不要用实心墨色**：强调色是稀缺资源（见「强调色预算」）
- **次按钮** `BTN_QUIET`：纯文字 `text-ink-muted hover:text-ink`，无边框无底色
- **图标按钮** `ICON_BTN`：`h-6 w-6`，无边框，hover `bg-[var(--oc-hover)]`
- **危险按钮**：实心 `bg-error text-paper`
- **AI 按钮**：用暖色文字 `text-warning`，不加边框
- 高度：页头与工具栏 `h-8`（32px）；页头内图标按钮 `h-6`；移动端最小热区 44px 由 padding 保证
- 全局 `button:hover` 由 `@layer base` 统一给 `background-color: var(--oc-hover)`；**因此整行/整格的按钮必须自带横向 padding**（否则高亮会贴住文字）
- 浮层菜单的高亮要**横向铺满**（macOS 观感）：容器 `MENU` 只有 `py-1`、**没有左右内边距**，行 `MENU_ITEM_BASE` 自带 `px-3`。不要在菜单容器上再加 `p-*`，否则 hover 左右会留缝

### 输入
- **下划线输入** `INPUT_LINE`：`border-b border-line bg-transparent px-0`，聚焦 `border-line-hover`；
  **没有边框盒、没有底色**（列表页搜索、设置弹窗、时期弹窗、相册搜索全用这一种）
- 页头内搜索 `INPUT_BARE`：`border-b border-transparent`，聚焦才显线
- 高度：列表工具栏 `h-8`；窄栏与页头内 `h-6`
- 错误态：文字 `text-error`（仍不加边框）

### 卡片
- **无边框、无阴影**：靠底色（`bg-paper-card`）与周围留白区分；悬停改底色（`hover:bg-[var(--oc-hover)]`）
- 列表卡片图片底部 40% 用渐变过渡到卡片底色（`from-paper-card`），避免图与底之间出现硬边
- 无图占位：衬线首字，不用图形图标

### 分割线
- **不再使用 `<Separator>` 组件**：区块之间用 `<div className="border-t border-line" />`，表格行用 `border-b border-line`
- **行列表不留尾线**：行用 `border-b` 画行间线，容器加 `LIST_END`（`[&>*:last-child]:border-b-0`）；两列网格用 `FIELD_GRID`（最后两格都去掉）。区块底部那条线什么都不分隔，只会让每个 section 看起来被方框围住
- 浮层内部的菜单分组线可以继续用 `Separator`（`mx-2 my-1 h-px bg-line`）—— 两端内缩，与满宽 hover 形成对比
- 竖分隔线（`Separator orientation="vertical"`）已从所有页头/工具栏移除

### chip（标签、已选关联项）
- `CHIP`：`bg-paper-alt px-2 py-[3px] text-[12px] text-ink-muted`，**无边框**、`rounded-item`
- `CHIP_ON`（选中）：`bg-ink text-paper`
- 标签选择器把「＋」与输入框合并进同一个 chip（见 `TagPicker.tsx`）；已选关联项与「＋ 添加」处于同一 `flex-wrap` 行内

### 对话框 / 抽屉
- 面板：`border border-line bg-paper/85 backdrop-blur-lg rounded-panel`，**无 ring**。
  `bg-paper/85` 自己就跟着主题走，**不要**再写 `dark:bg-[#1C1B1A]/85`（那串十六进制等于把令牌抄一遍）
- 遮罩 `bg-black/15 dark:bg-black/40`
- 弹窗标题用 `PAGE_TITLE`（18px 衬线加粗），描述 13px `ink-muted`

### 通知 (Toast)
- sonner，左下角；`background: paper-card` + `1px border-line`，**12px 字号、4px 圆角**、无阴影
- 不使用彩色左边线；成功 / 警告 / 错误只靠图标与文案区分

### 复选框 / 单选框 / 开关
- 复选框 `rounded-item`（3px）；单选框、开关滑块保持**圆形/方块**语义（勾选与开关滑块不使用 `rounded-*` 之外的造型）
- 复选框：`h-4 w-4 border border-line bg-paper-card`，勾为 `ink-muted` 的 `strokeWidth={2}` 折线
- 单选框 / 主题选择：`h-4 w-4 rounded-full border`，选中为内部 8px **圆点**（`bg-ink-muted rounded-full`）
- 开关：**胶囊**轨道 `h-5 w-9 rounded-full border`（on: `border-line-hover bg-ink-muted`）+ **圆形**滑块 `h-3.5 w-3.5 rounded-full`（`SWITCH_CLASSES` / `SWITCH_DOT`）
- 滑杆（时间线缩放、裁剪缩放）：轨道与拇指都用 `rounded-full`
- 禁用：`opacity-50`；包裹文字 `text-sm text-ink gap-2`

### 下拉选择器 (Select)
- 触发器：**纯文字** `h-8 px-2 text-[13px] text-ink`，无边框无底色，hover `bg-[var(--oc-hover)]`；图标 `ChevronDown size={14} strokeWidth={2}`
- 面板：`MENU`；选项：`MENU_ITEM`，选中项 `bg-[var(--oc-hover)] text-ink`
- 列表页的「视图切换」用**图标**（lucide `LayoutGrid` / `List`，`h-8 w-8`）：当前项 `text-ink`、另一项 `text-ink-faint`（默认画廊、本地记忆）

### 浮层面板（统一）
- 所有 Portal 浮层：`border border-line bg-paper/85 backdrop-blur-lg shadow-none rounded-menu`（即 `MENU`；大面板用 `PANEL` → `rounded-panel`）
- 菜单容器**只有 `py-1`、没有左右内边距**，行自带 `px-3` → hover 横向铺满、左右不留缝
- 行高：`px-3 py-1 text-[13px]`（约 27px）；分组标题 `px-3 py-1 text-[11px]`；分隔线 `mx-2 my-1`
- **无 `ring` 光晕**；菜单项 hover 统一 `bg-[var(--oc-hover)]`（亮暗自适应的一档极低透明度墨色）
- 危险操作：`text-error`
- 遮罩：`bg-black/15 dark:bg-black/40`

### 浮层内的按钮（历史方案已废弃）
早期版本为「毛玻璃上按钮用 `bg-white/60` 隆起、`bg-black/5` 凹陷」的分层体系，**现已全部废弃**。
现行规则只有三条，与页面其它地方一致：
- 主操作：`BTN_PRIMARY`（浅底实心 `bg-paper-card`），**不是**实心墨色
- 次操作：`BTN_QUIET`（纯文字 `text-ink-muted hover:text-ink`）
- 图标按钮：无边框，hover `bg-[var(--oc-hover)]`

实心墨色 `bg-ink text-paper` 只用于**选中态**（气泡菜单当前格式、块类型当前项、chip 选中）。

不再使用 `bg-white/*` 遮罩、不再用「隆起/凹陷」表达可用性；也不再用 `bg-black/5 dark:bg-white/5` 当「抬起/选中」底色 —— 那是 `bg-[var(--oc-hover)]`。

### 下拉菜单 (DropdownMenu)
- 使用 `@base-ui/react` Menu.Portal + Popup
- Positioner 使用 `positionMethod="fixed" align="start"`
- Popup 为 `MENU`（`rounded-menu`，`py-1` 无左右内边距）+ `pointer-events-none`，MenuItem 为 `pointer-events-auto`
- Item 直接用 `MENU_ITEM`（含 `data-highlighted` 高亮），不要再写 `px-*/py-*`

### 右键菜单 (ContextMenu)
- **系统右键菜单不出现在界面里**：`GlobalContextMenu` 在 `document` 上统一拦截 `contextmenu` —— 非文本区一律 `preventDefault()`（右键在那里就是「没反应」，需要菜单的地方由应用自己的菜单接手）；输入框 / textarea / 全选中的可编辑区保留系统菜单（复制粘贴靠它）
- 面板：`MENU`（`border border-line bg-paper/85 backdrop-blur-lg shadow-none rounded-menu`，无 ring）
- 子菜单通过 `createPortal` 到 `#overlay-root`，`position: fixed` + 视口坐标，面板同样 `MENU`
- 菜单项：`MENU_ITEM_BASE`（`gap-2 px-3 py-1 text-[13px] rounded-item`，hover `bg-[var(--oc-hover)]`）；自定义语气（危险/禁用）只换文字色，不重写盒子
- 危险操作：`text-error`

### 弹窗 (Dialog/AlertDialog)
- 遮罩：`bg-black/15 dark:bg-black/40`（无 blur）
- 面板：`border border-line bg-paper/85 backdrop-blur-lg rounded-panel`，**无 ring**
- 按钮：确定 = `BTN_PRIMARY`（浅底实心；破坏性操作才用 `bg-error text-paper`），取消 = `BTN_QUIET`
- 关窗按钮：`ICON_BTN`（`X`，`strokeWidth={2}`），`top-3 right-3`

### 固定底色上的文字
用户选的固定色（时期条、标签）不随主题翻转，上面的文字也**不能**用 `text-ink` / `text-paper`（那两个跟着主题翻）。
用固定色令牌：`text-ink-fixed`（`--oc-ink-fixed` #2B2B2B）/ `text-paper-fixed`（`--oc-paper-fixed` #FEFCF8），由亮度决定用哪个（`isLightColor()`）。

### 气泡菜单 (BubbleMenu)
- 面板：`MENU`（`rounded-menu`）
- 按钮：`h-8 w-8`，**激活 `bg-ink text-paper`**，未激活 `text-ink-muted hover:text-ink`

### 顶栏 (Toolbar / 页头)
- **统一 48px**：`h-12 sticky top-0 z-10 border-b border-line bg-paper/85 backdrop-blur-lg`（`bg-paper` 自带明暗，别再叠 `dark:bg-[#1C1B1A]/85`）
  横向内边距：列表页 `px-6`；编辑器 / 相册 / 世界观 `px-4`（与各自内容列对齐）
- 标题用 `PAGE_TITLE`（18px 衬线加粗）；页头内控件一律 `h-8`，图标按钮 `h-6`
- 不再有竖分隔线；视图切换用文字（见「下拉选择器」）
- 应用级外壳更薄：菜单栏 **32px**（`h-8`，品牌 13px 衬线）、状态栏 **24px**（`h-6`，11px）
- 页面外层 `flex flex-col min-h-full`（非 `h-full`），内容区不设 `overflow-auto`（由 `<main>` 统一滚动）
- **例外**：WorldLayout 侧边栏+编辑器分栏布局，保持内部 `flex h-full` + `overflow-auto`

### 透明区域文字
- `.transparent-text` 类用于 Mica 效果下的文字阴影补偿
- 仅在 `html.tauri-mica` 激活时生效

### #overlay-root
- 统一浮层容器：`position: fixed; inset: 0; pointer-events: none; z-index: 999999`
- 不设置背景，自身不拦截事件
- **硬性规则**：所有浮层必须通过 `createPortal` 渲染到此容器
- 禁止在顶栏等含 `backdrop-blur` 合成层的元素内部使用 `absolute` 定位浮层
- 非 Portal 的浮层（如 BubbleMenu）仅在无 backdrop-blur 祖先时安全

### 全局按钮 hover
- 全局 `button` 通过 `@layer base` 统一继承 `background-color: var(--oc-hover)`（亮 `rgba(43,43,43,.045)` / 暗 `rgba(227,223,216,.06)`）
- **副作用**：任何整行/整格的按钮都会拿到一块底色，因此**必须自带横向 padding**；想要更宽的高亮用「行加 `px-*` + 外层等量负 margin」（概览的统计行与最近更新行即此做法）
- 不需要底色的按钮显式写 `hover:bg-transparent`

## 4. 图标
- **唯一来源**：`lucide-react`，`strokeWidth={2}`
- 尺寸：桌面 16px，移动 20px。颜色继承父级文字色
- 状态图标：成功用 `CheckCircle` (灰)，错误用 `XCircle` (红)，警告用 `AlertTriangle` (黄)
- **语义规则**：返回/关闭=`ArrowLeft`，折叠（收侧边栏）=`ChevronLeft`，展开（开侧边栏）=`Menu`

## 5. 数据可视化风格
- 坐标轴 / 连线 / 刻度：1px `line`；数据线：1.5px `ink-muted`
- 节点与图例标记**与实体形态一致**：角色 / 国家用圆形头像（唯一允许的圆形），事件块用方形矩形（`bg-paper-card` + 1px `line`）
- 时间线上的时间点：**方形小色块**（`h-2 w-2`），不用圆点
- 标签：`text-[11px]` / `text-xs`，颜色 `ink-muted`

## 6. 动画规范
- **不引入动画库**（项目未安装 `framer-motion`）：一律 CSS `transition` + `tw-animate-css` 的数据属性动画
- 令牌（`globals.css`）：`--dur-fast: 150ms`、`--dur-base: 200ms`、`--ease-quiet: cubic-bezier(0.2, 0.6, 0.2, 1)`
- 类型：浮层淡入（150ms）、面板滑入（200ms ease-out）、列表淡入（150ms）、按压反馈（120ms）
- `prefers-reduced-motion` 下全局关闭过渡与动画
- **禁止**：弹性动画、大幅位移、循环动画

## 7. 移动端触控反馈规范
- **有边框控件**（`border border-line`）：使用 `touch-feedback` class → 120ms `scale(0.96)` 缩放
- **无边框控件**：`active:bg-[var(--oc-hover)]`（背景高亮）+ `rounded-item`
- CSS 定义：`globals.css` 中 `.touch-feedback { transition: transform 120ms ease-out; } .touch-feedback:active { transform: scale(0.96); }`
- 例外：MobileTabBar、GlobalAlbum 分类切换按钮保持简洁无感

### MobileActionSheet
- iOS 风格底部弹出菜单，Portal 到 `#overlay-root`，`z-[60]`
- 遮罩：`bg-black/15`，外层容器 `onPointerDown={onClose}` 统一关闭
- 面板：`bg-paper/95 backdrop-blur-lg` + `rounded-t-panel`（只圆上面两个角，底部贴屏幕边），底部 `padding-bottom: var(--safe-bottom)`，`data-action-sheet-panel` + `onPointerDown={e => e.stopPropagation()}` 阻止冒泡
- 动画：`translateY(0)` / `translateY(100%)` 滑入滑出，250ms ease-out
- 操作项：`touch-feedback hover:bg-[var(--oc-hover)]`，危险操作 `text-error`
- 取消按钮：`text-ink-muted`，固定在最下方

### MobileFab
- 右下角悬浮，`bottom-[calc(5rem+var(--safe-bottom))]`，`rounded-media` + `border border-line bg-paper/85 backdrop-blur-lg`
- 内部按钮 `h-10 w-10`（`rounded-item`）
- 选中指示器：绝对定位色块 `bg-[var(--oc-hover)]` + `rounded-item`，`transition-[top] duration-300 ease-out` 在网格/列表之间滑动
- 非选中态保留 `active:bg-[var(--oc-hover)]` 按压反馈

## 8. 例外允许的颜色
- 图片 hover 遮罩允许：`bg-black/40`、`bg-black/30` 等半透明黑色
- 遮罩内文字允许：`text-white`
- `FullscreenViewer` 全屏背景允许：`bg-black/80`
- 标签色板（`src/lib/tag-colors.ts` + `TagBadge`）允许**字面量十六进制**类名（如 `bg-[#FF6B6B]/15 text-[#FF6B6B]`）：颜色是用户数据，Tailwind JIT 按源码文本扫描，**不能**写成 `bg-[${hex}]/15`
- 关系图的 canvas/SVG 层（点阵、连线、缩略图）写 `var(--color-line)` 这类**令牌变量**，不写十六进制 —— 它不经过 Tailwind，暗色下写死就会错色
