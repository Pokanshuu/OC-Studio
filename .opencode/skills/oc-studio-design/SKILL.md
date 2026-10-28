---
name: oc-studio-design
description: >
  OC Studio 设计系统（寂静工作台）。定义设计理念、色彩/字体/间距令牌、所有原子组件样式约束、
  暗黑模式规范、图标和数据可视化风格、动画规范。所有 UI 生成必须遵循此文件。
  触发词：设计系统、UI规范、样式、颜色、组件样式、暗黑模式、图标、动画。
---

# OC Studio 设计系统（寂静工作台）

> **改完 UI 跑一次 `npm run audit:design`**（`scripts/design-audit.ts`）：它扫全项目找像素圆角 / Tailwind 原色 / 暗色十六进制 / 黑白半透明底 / 阴影 / 粗描边 / ring 光晕，并列出「重复 ≥3 次、该收进 `lib/ui-tokens.ts` 的类名串」。
> 确有例外就当场写 `// design-audit-allow <规则名> 一句话理由`，理由必须写在代码里，不许只写在脑子里。

## 1. 设计理念
- **绝对寂静**：界面退后至无形，色彩仅属于创作者内容。界面只用暖灰白。
- **极小圆角 · 零描边**：圆角只有三档 4 / 6 / 8（`rounded-item` / `rounded-control` / `rounded-panel`），除圆形头像/徽章/色点外**不做胶囊、不做大圆角**；控件**零描边**（输入只留一条底线）。
  线只出现在四个地方：**区块之间 / 表格行 / 浮层边界 / 空态占位框**。传递克制、严谨的秩序感。
- **内容优先**：编辑器/内容区内允许使用用户自定义色卡，但 UI 框架必须保持无色。
- **文案节制**：**Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.** —— 不写多余的次级标签与说明文字，解释交给布局（位置 / 层级 / 状态 / 留白）。硬规则与审查表见 §9。

## 2. 设计令牌

### 色彩（亮色模式）
- **基底**：`paper` #FEFCF8 (主背景)、`paper-alt` #FAF7F2 (侧边栏)、`paper-card` #F3EFE9 (卡片/输入框底)
- **边框**：`line` #E7E3DC (默认)、`line-hover` #D6D0C4 (悬停/焦点)
- **文字**：`ink` #2B2B2B (主文)、`ink-muted` #6E6A63 (辅助)、`ink-faint` #A5A098 (占位/禁用)
- **状态色（仅三种 + 一枚危险底色）**：
  - 错误：`error` #B36651 —— 错误文字（`text-error`）、危险项的 hover 浅底（`bg-error-light`）
  - 危险底：`danger` #9C5F4D —— **灰调红**（比 `error` 低饱和一档）。只做破坏性按钮的**实心底色**（`BTN_DANGER` = `bg-danger text-danger-ink hover:bg-danger-hover`），不用它写字
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
- **三档圆角，按元素角色选**：界面语言是「极小圆角」，所以只有 4 / 6 / 8 三档（唯一源是 `globals.css` 的 `@theme`；取类名走 `ui-tokens.ts` 的 `ROUND_*`）。同一块区域里不混两档。

  | 档 | 令牌 | 值 | 一句话 | 具体元素（逐个点名） |
  |---|---|---|---|---|
  | 小 | `rounded-item` | 4px | 贴在内容上、自己是一个小格子 | chip / 标签 / 已选关联项 · 菜单行（右键 / 下拉 / 筛选 / @ / /）· **列表行**（目录视图的悬停 / 选中块）· 复选框 · 缩略图与所有图片（画廊格子、列表卡图区、头图、立绘、上传占位框、裁剪框、编辑器图片与表格）· 列表卡片与图节点 · 方形头像 · toast · 小色块 |
  | 中 | `rounded-control` | 6px | 一个「能点」的控件，或一块浮层本体 | 主/次按钮、图标按钮（`h-6` / `h-8`）· 浮层菜单容器（`MENU`）· 下拉 / 筛选 / 选词工具条 · 关系图工具面板 · 移动端筛选按钮 |
  | 大 | `rounded-panel` | 8px | 一块浮在内容之上、要「盖住」东西的容器 | 弹窗（Dialog / AlertDialog）· 回收站浮层 · 大面板（`PANEL`）· 移动端底部抽屉（只圆上两角用 `rounded-t-panel`）· 悬浮工具条（MobileFab 外框） |

  **判定顺序**（照这个走就不会乱）：
  1. 圆形语义（头像 / 旗帜 / 徽章 / 色点 / 开关 / 滑杆 / 压在图片上的圆钮）→ `rounded-full`
  2. 浮在内容之上的容器（弹窗 / 抽屉 / 悬浮条）→ **大** `panel`
  3. 能点的控件、或浮层本体（按钮 / 菜单容器 / 面板）→ **中** `control`
  4. 其余（行 / chip / 图 / 卡片 / 格子）→ **小** `item`

  **同心圆角**：容器有内边距时，外层比内层大一档（外层 8、内层 4）。例：MobileFab 外框 `rounded-panel p-1`，里面选中的块 `rounded-item`。
  **线段不圆**：下划线指示器、分隔线、行内 code、贴边整条（移动端 TabBar 用 `rounded-none`）一律方头。
- **没有第 5 个圆角名**：`rounded-media` / `rounded-menu` 已并入 `item` / `control`（图片·卡片用 item，菜单·浮层用 control），代码里再出现就是回潮，audit 会拦。
- **禁止**：`rounded-[6px]` 这类像素字面量、`rounded-sm|md|lg|xl`（Tailwind/shadcn 固定值，会与三档打架）、裸 `rounded`、拿 `rounded-full` 做胶囊（头像/徽章/色点/开关/图上的圆钮除外）。
- **例外（必须圆）**：浮在图片 / 头像 / 全屏查看器上的操作按钮 —— 相机、删除、左右翻页、关闭 —— 一律 `rounded-full`；它们压在图上是「浮起的圆钮」，方形会显得很硬。页面里的按钮才是 `rounded-control`。
- 颜色色板：圆形色点 `h-6 w-6 rounded-full`，选中 = `ring-1 ring-ink ring-offset-2 ring-offset-paper`，未选中 `ring-1 ring-transparent hover:ring-line-hover`（不做 2px 粗环）
- **内容面零阴影，浮层只有一档**：卡片 / 按钮 / 输入不写 `shadow-*`（悬停改**底色**）；浮层（菜单 / 下拉 / 右键 / 面板 / 弹窗 / 抽屉 / 通知）统一用 `FLOAT_SHADOW`（`float-shadow`，值在 `globals.css`：近处 `0 1px 2px` 墨 5% + 远处 `0 6px 16px -6px` 墨 12%；暗色加深）。**不要用** Tailwind 的 `shadow-sm/md/lg`，也不要自己编阴影值。浮层不加 `ring`

## 3. 原子组件样式

### 按钮
> 类名一律取自 `src/lib/ui-tokens.ts`；本节只描述形态。

- **主按钮** `BTN_PRIMARY`：**浅底实心** `bg-paper-card text-ink h-8 px-3 text-[13px]`，无边框，hover 加深到 `bg-line`。**不要用实心墨色**：强调色是稀缺资源（见「强调色预算」）
- **次按钮** `BTN_QUIET`：纯文字 `text-ink-muted hover:text-ink`，无边框无底色
- **图标按钮** `ICON_BTN`：`h-6 w-6`，无边框，hover `bg-[var(--oc-hover)]`
- **危险按钮** `BTN_DANGER`：**灰调红实心** `bg-danger text-danger-ink hover:bg-danger-hover`，`h-8 px-3 text-[13px]`。全局唯一形态，只给「点下去数据就没了」的确认键（删除 / 永久删除 / 放弃未保存改动 / 清空并导入）。**不要**自编红底、不要描边红、不要把危险项做成菜单里的红块（菜单行只换文字色，见 §浮层菜单）
- 高度：页头与工具栏 `h-8`（32px）；页头内图标按钮 `h-6`；移动端最小热区 44px 由 padding 保证
- 全局 `button:hover` 由 `@layer base` 统一给 `background-color: var(--oc-hover)`；**因此整行/整格的按钮必须自带横向 padding**（否则高亮会贴住文字）
- 浮层菜单的高亮要**横向铺满**（macOS 观感）：容器 `MENU` 只有 `py-1`、**没有左右内边距**，行 `MENU_ITEM_BASE` 自带 `px-3`。不要在菜单容器上再加 `p-*`，否则 hover 左右会留缝

### 页签 (Tabs)
> 实现唯一源：`src/components/ui/tabs.tsx`（Base UI Tabs）。设置弹窗的「世界 / 个性化 / 数据 / 关于」就是它。

- **列表**：一条 1px `border-line` 底线横贯整排，页签等分列（`grid grid-cols-N`），列间**不留 gap**
- **页签项**：`px-3 pt-1.5 pb-2 text-[13px]`，未选中 `text-ink-muted`；**悬停只换文字色，不铺底色**（这一排没有「块」，铺了会跟选中态撞脸；全局 `button:hover` 的底色要显式取消）
- **选中**：文字 `text-ink` + **2px 墨色下划线**（`after` 伪元素：`inset-x-0` / `-bottom-px` / `h-[2px]` / `bg-ink`），压住列表那条底线 —— 视觉上是「底线在选中段被描重了」
- 下划线**方头、不收圆角**（它是一段线，不是胶囊）；宽度 = 该页签整列宽（等分时即列宽），移动端只剩图标时也一样
- 不要用浅底圆角块做页签选中：胶囊会让「选中」和「悬停」看起来是同一件事，且下划线压在圆角上会翘边

### 设置弹窗（SettingsDialog）
> 一套字族、一套对齐。设置里**不许出现第二种标题字体**，也不许有的按钮居中、有的靠左。

- **字族**：衬线只留给「页面级标题」（弹窗标题「设置」用 `PAGE_TITLE`、页面标题、实体名输入）；**设置内部一律黑体**，不写 `font-serif` / `SECTION_TITLE`
- **黑体三档，按角色取，不按大小随手写**：
  | 角色 | 类名 |
  |---|---|
  | 分组标题（导入与导出 / 同步 / 角色基本信息） | `text-sm font-medium text-ink` |
  | 字段标签（世界名称 / 版本 / 服务端地址） | `text-sm text-ink` |
  | 说明 / 状态（JSON 不含图片、开发中） | `text-xs text-ink-faint` |
- **动作按钮文字居中**（导入 / 导出 / 发布 / 检查更新 / 访问 GitHub）：`justify-center`。**二级页面入口不是动作按钮，是列表行**：文字靠左、`›` 靠右，两端对齐（`justify-between`）
- 分组之间用 `border-t border-line` 分隔，不写副标题、不加小标题说明（见 §9 文案预算）

### 输入
- **下划线输入** `INPUT_LINE`：`border-b border-line bg-transparent px-0`，聚焦 `border-line-hover`；
  **没有边框盒、没有底色**（列表页搜索、设置弹窗、时期弹窗、相册搜索全用这一种）
- 页头内搜索 `INPUT_BARE`：`border-b border-transparent`，聚焦才显线
- **年 / 月 / 日 三段** `DATE_INPUT`（`h-6 w-14`）：三个输入框并排、整组共用一条底线，段内不各自画线（事件时间、角色生日、时期弹窗同一套语言）。年份可为负（`-20`）
- 高度：列表工具栏 `h-8`；窄栏与页头内 `h-6`
- 错误态：文字 `text-error`（仍不加边框）
- **禁止原生 `<datalist>` / `<input type="date">` 等系统弹层**：由 WebView 自己画，不在 DOM 里，圆角/阴影/宽度/暗色都不可控。要建议列表就自己写 input + portal 的 `MENU`（见「下拉选择器」）

### 卡片
- **无边框、无阴影**：靠底色（`bg-paper-card`）与周围留白区分；悬停改底色（`hover:bg-[var(--oc-hover)]`）
- 列表卡片图片底部 40% 用渐变过渡到卡片底色（`from-paper-card`），避免图与底之间出现硬边
- 无图占位：衬线首字，不用图形图标

### 分割线
- **不再使用 `<Separator>` 组件**：区块之间用 `<div className="border-t border-line" />`，表格行用 `border-b border-line`
- **可点的整行不要用 `border-b`**：圆角会把线的两端带弯（看着像括号/尾巴）。改用 `.row-rule`（行内 `::after` 直线，两端各缩 8px）+ 容器 `.rules-end`（最后一行不画线）。不可点的行（字段行那种 div）继续 `border-b`
- **行列表不留尾线**：行用 `border-b` 画行间线，容器加 `LIST_END`（`[&>*:last-child]:border-b-0`）；两列网格用 `FIELD_GRID`（最后两格都去掉）。区块底部那条线什么都不分隔，只会让每个 section 看起来被方框围住
- **列表行（目录视图）**：行底色的悬停 / 选中块是**小档圆角**（`rounded-item`），行间线用 `.row-rule` + 容器 `.rules-end` —— 用 `border-b` 的话线会跟着 4px 圆角拐弯，看着像括号/尾巴
- **例外：侧栏 / 目录树的行是「满宽条」**（主 `Sidebar`、相册分类树）：悬停 / 选中块从面板左边缘铺到右边缘，**容器不留左右内边距**，内边距只由行自己给（`px-3`，二级 `pl-6 pr-3`）；圆角仍是小档 `rounded-item`（4px，满宽时只在两端切个很小的角）。它们是导航条，不是列表卡片
- **选中态只有两种形态，按元素定、不许混**：**页签（Tabs）→ 2px 墨色下划线**（压在列表的 1px 底线上，详见「页签」一节）；其余（菜单项 / 分段项 / 卡片 / chip）→ 浅底块 `bg-[var(--oc-hover)]` 或 `bg-paper-card`。下划线**不要**画在圆角块下面：圆角会让线在两端拐弯、还多出一截尾巴
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
- sonner，左下角；`background: paper-card` + `1px border-line`，**12px 字号、4px 圆角、浮层阴影**（`--oc-shadow-float`）
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
- 参考实现：`FilterSelect`（纯筛选）/ 需要「可自由输入 + 建议」时照它写 `input` + `createPortal` 到 `#overlay-root` 的 `MENU` 面板，注意 `onMouseDown` 要 `preventDefault()`，否则输入框先失焦、面板先关，`click` 永远到不了

### 浮层面板（统一）
- 所有 Portal 浮层：`border border-line bg-paper/85 backdrop-blur-lg float-shadow rounded-menu`（即 `MENU`；大面板用 `PANEL` → `rounded-panel`）
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
- 面板：`MENU`（`border border-line bg-paper/85 backdrop-blur-lg float-shadow rounded-menu`，无 ring）
- 子菜单通过 `createPortal` 到 `#overlay-root`，`position: fixed` + 视口坐标，面板同样 `MENU`
- 菜单项：`MENU_ITEM_BASE`（`gap-2 px-3 py-1 text-[13px] rounded-item`，hover `bg-[var(--oc-hover)]`）；自定义语气（危险/禁用）只换文字色，不重写盒子
- 危险操作：`text-error`

### 弹窗 (Dialog/AlertDialog)
- 遮罩：`bg-black/15 dark:bg-black/40`（无 blur）
- 面板：`border border-line bg-paper/85 backdrop-blur-lg rounded-panel`，**无 ring**
- 按钮：确定 = `BTN_PRIMARY`（浅底实心），**破坏性操作 = `BTN_DANGER`**（灰调红实心），取消 = `BTN_QUIET`
  - `AlertDialogAction` 自带 `BTN_DANGER`：本项目里 AlertDialog 的确认动作都是破坏性的（删除 / 永久删除 / 放弃改动）。调用点**不要再传** `bg-ink` / `bg-error` 之类底色，传了只会互相覆盖
  - 非破坏性确认（导入 / 合并）放在 `AlertDialogFooter` 里的普通 `<button className={BTN_PRIMARY}>`，别改 `AlertDialogAction`
- 关窗按钮：`ICON_BTN`（`X`，`strokeWidth={2}`），`top-3 right-3`

### 固定底色上的文字
用户选的固定色（时期条、标签）不随主题翻转，上面的文字也**不能**用 `text-ink` / `text-paper`（那两个跟着主题翻）。
用固定色令牌：`text-ink-fixed`（`--oc-ink-fixed` #2B2B2B）/ `text-paper-fixed`（`--oc-paper-fixed` #FEFCF8），由亮度决定用哪个（`isLightColor()`）。

### 气泡菜单 (BubbleMenu)
- 面板：`MENU`（`rounded-menu`）
- 按钮：`h-8 w-8`，**激活 `bg-ink text-paper`**，未激活 `text-ink-muted hover:text-ink`

### 应用外壳（MenuBar / Sidebar / StatusBar / 内容区）
- **chrome 三块之间不画线**：菜单栏、状态栏、侧边栏去掉 `border-b / border-t / border-r`，共用同一个表面
- 表面底色只由 `globals.css` 给：`html:not(.tauri-mica) [data-app-shell|data-menubar|data-sidebar|data-statusbar] { background: paper-alt }`，**Mica 下必须 `transparent`**。
  **禁止在这些元素或它们的任何父级上写 `bg-*`** —— 会把 Mica 毛玻璃整个盖死（`[data-app-shell]` 就是外壳容器本身，只负责给底色，别在组件里再叠 bg）
- **内容区是一块面板**：`bg-paper` + `border border-line` + `rounded-control`（6px）
  - 这条 border 就是「chrome 与内容区之间**保留**的那条线」；chrome 内部不再有第二条线
  - 面板**不加内外边距**：内容仍然贴到原来的位置（`main` 唯一的额外样式是圆角 + 边框）
  - 6px 是外壳专用取值：整窗尺寸下 8px 显得太软（像被包住），但仍在三档之内
- `<main>` 仍是唯一滚动容器（`overflow-x-auto main-scroll`）；圆角与边框不影响 `sticky` 头部
- **侧边栏宽度可拖**：默认 140px，右边缘留一条 6px 命中区（`cursor-col-resize`，悬停显 `--oc-hover`，**不画分隔线**），可调 112–168px（默认的 0.8–1.2 倍），双击复位；常量与夹取在 `src/lib/sidebar-width.ts`，偏好存 `settings.sidebarWidth`
- 分隔线只在**内容区内部**使用：区块之间 / 表格行 / 空态占位框

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
- 全局按钮默认带 `border-radius: var(--radius-control)`（6px）：漏写圆角类的按钮，hover 底色也不会是方块。显式 `rounded-*` 覆盖它；贴边的整条按钮（移动端 TabBar）用 `rounded-none`
- **副作用**：任何整行/整格的按钮都会拿到一块底色，因此**必须自带横向 padding**；想要更宽的高亮用「行加 `px-*` + 外层等量负 margin」（概览的统计行与最近更新行即此做法）
- 不需要底色的按钮显式写 `hover:bg-transparent`
- 危险项的**浅底** `hover:bg-error-light`（`--oc-error-light` 自带明暗）只给「行」与图标按钮（菜单行 / 删除图标）；**危险按钮**是实心 `BTN_DANGER`，两套别混用。不要写 `bg-red-50` / `dark:bg-red-950/30` 这类 Tailwind 原色

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
- 关系图的连线手柄：节点上 / 右 / 下 / 左**四向**小圆点（`NODE_HANDLE`，12px，移动端 16px），桌面**悬停节点才显形**（`md:group-hover`）、移动端常显，可落点时填墨（React Flow 的 `.valid`）；每条边按目标方位选落点（`routeEdges`），贝塞尔曲率 0.15，连线用 `ink-muted` 1.5px

## 6. 动画规范
- **不引入动画库**（项目未安装 `framer-motion`）：一律 CSS `transition` + `tw-animate-css` 的数据属性动画
- 令牌（`globals.css`）：`--dur-fast: 150ms`、`--dur-base: 200ms`、`--ease-quiet: cubic-bezier(0.2, 0.6, 0.2, 1)`
- 类型：浮层淡入（150ms）、面板滑入（200ms ease-out）、列表淡入（150ms）、按压反馈（120ms）
- `prefers-reduced-motion` 下全局关闭过渡与动画
- **禁止**：弹性动画、大幅位移、循环动画
- **唯一例外：头图弹性**（`src/components/shared/StretchyHeader.tsx`）—— 头图是**内容**不是控件：在页面顶部继续下拉时跟着手 / 滚轮**放大**（框跟着长高，图等比放大不变形，左右被裁、上下不裁）、松手回弹，上滚时收窄并带一点视差。它是**直接操纵反馈**（拉多少动多少、停在手指位置），不是自动播放的动画。`prefers-reduced-motion` 下整段关闭，退回静态 3:2 图。**别把这种弹性搬到按钮 / 面板 / 列表 / 页头上**

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
- 右下角悬浮，`bottom-[calc(5rem+var(--safe-bottom))]`，`rounded-panel`（外框大档）+ `border border-line bg-paper/85 backdrop-blur-lg`
- 内部按钮 `h-10 w-10`（`rounded-item`，与外框同心：外层 8 − padding 4 = 内层 4）
- 选中指示器：绝对定位色块 `bg-[var(--oc-hover)]` + `rounded-item`，`transition-[top] duration-300 ease-out` 在网格/列表之间滑动
- 非选中态保留 `active:bg-[var(--oc-hover)]` 按压反馈

## 8. 例外允许的颜色
- 图片 hover 遮罩允许：`bg-black/40`、`bg-black/30` 等半透明黑色
- 遮罩内文字允许：`text-white`
- `FullscreenViewer` 全屏背景允许：`bg-black/80`
- 标签色板（`src/lib/tag-colors.ts` + `TagBadge`）允许**字面量十六进制**类名（如 `bg-[#FF6B6B]/15 text-[#FF6B6B]`）：颜色是用户数据，Tailwind JIT 按源码文本扫描，**不能**写成 `bg-[${hex}]/15`
- 关系图的 canvas/SVG 层（点阵、连线、缩略图）写 `var(--color-line)` 这类**令牌变量**，不写十六进制 —— 它不经过 Tailwind，暗色下写死就会错色

## 9. 文案预算：让布局自己解释

> **Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.**
> 不写多余的次级标签与说明文字 —— 布局（位置 / 层级 / 状态 / 留白）自己会解释。

界面只靠一套语法说话：标题、标签、控件、留白。**补一句小字，往往是布局没讲清，而不是用户需要那句话。**

### 默认：不加
- 标题下面**不加**副标题句；设置项下面**不加**说明；按钮里**不加**第二行小字
- **禁用**已经由 `opacity-50` / `cursor-not-allowed` 表达，不再补「当前不可用」「桌面端支持」
- placeholder **不复述标签**（标签是「简介」，placeholder 就不写「在这里输入简介」；要写就写例子）
- 不写「注：」「说明：」「提示：」「备注：」这类散文前缀 —— 真要说明，直接说事

### 只有四种说明允许保留（而且必须一句话）
| 类型 | 例子 | 形式 |
|---|---|---|
| 破坏性 / 不可逆后果 | 「删除后可在回收站找回」 | 紧贴动作下方，`text-xs text-ink-faint` |
| 数据口径 | 「JSON 不含图片，静态站内联图片」 | 同上 |
| 隐私 / 安全 | 「密钥只存本地」 | 同上 |
| 功能未开放 | 「开发中」 | 禁用控件旁，2–4 字 |

形式硬约束：**一句话、≤ 20 字、只占一行、紧跟被说明的元素**；不换行成段、不加第二句、不放在标题上方、不写进按钮的第二行。

### 审查（每次动 UI 都要过）
- `npm run audit:design` 的 `prose-prefix` 规则会拦「注：/说明：/提示：/备注：」这类散文前缀
- 人工问四个问题，有一条中招就删：
  1. 删掉它，用户会看不懂吗？不会 → 删
  2. 它是不是把「禁用 / 选中 / 空 / 有内容」又说了一遍？是 → 删
  3. 它是不是在解释布局（「下面可以…」「这里是…」）？是 → 删
  4. 它属于上面四种允许类型吗？不属于 → 删
- 空态是例外：空态允许**一句话**，且优先用可点的 `EMPTY_HINT`（「点这里去建一个」），不要写说明文
