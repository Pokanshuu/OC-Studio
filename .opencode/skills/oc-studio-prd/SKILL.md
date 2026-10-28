---
name: oc-studio-prd
description: >
  OC Studio 产品需求 + 开发路线图 + 当前进度 + 已知问题。定义产品定位、功能模块详解、
  技术栈约束、布局与交互、开发分期、已完成和待处理任务。所有功能开发必须参考此文件。
  触发词：产品需求、PRD、功能模块、开发计划、进度、路线图、roadmap。
---

# OC Studio 产品需求与路线图

## 1. 产品定义
- **核心价值**：一个本地优先、专注效率的原创角色（OC）与世界观创作工作台。
- **产品形态**：PWA/App 混合，Tauri 桌面打包，支持导出静态展示网站。
- **AI：暂不提供。** 2026-10 已把 AI 相关代码整体删除（`src/lib/ai/`、`EventAiSummary`、设置里的 AI 页签与字段、事件表单的概括逻辑）。要做得当成新功能重新设计 —— **不要恢复旧实现、不要留隐藏入口、不要在文案里承诺 AI 能力**。
- **当前版本**：v0.19.0-alpha

## 2. 技术栈约束

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| 前端框架 | Next.js 16 (App Router) + TypeScript strict | 静态导出 (`output: 'export'`) |
| 样式方案 | Tailwind CSS v4 + shadcn/ui | 必须覆盖 shadcn 默认样式以符合设计系统 |
| 本地数据库 | Dexie.js (IndexedDB) v4 | 全局唯一数据源，异步读写 |
| 编辑器 | TipTap (ProseMirror) | 所有富文本编辑共用一个内核 |
| 可视化 | @xyflow/react (关系图) | 自定义组件用于时间线和树状图 |
| 桌面打包 | Tauri v2 | Windows 原生体验 |
| 移动端打包 | Capacitor v8 | Android 原生体验 |
| 移动端剪贴板 | @capacitor/clipboard | 原生剪贴板读写 |
| 图标 | lucide-react | strokeWidth={2} |

## 3. 布局与交互

### 工作台模式（桌面端）
- 四区布局：顶部 MenuBar + 左 140px Sidebar（右边缘可拖，112–168px，默认值 0.8–1.2 倍，双击复位，宽度记忆在本地）+ 中央内容区（含小选项卡） + 底部 StatusBar
- 支持拖拽管理（时间线、树状图），复杂操作提供快捷键和右键菜单

### 移动端工作台（Phase 1，已完成）
- 底部 5 Tab 导航（MobileTabBar）+ 顶部顶栏（MobileTopBar）+ 筛选菜单栏（MobileFilterBar）
- MobileFab 浮动视图切换（网格/列表）
- MobileTopBar 支持动态标题 + 页面动作按钮（折叠/展开），通过 MobilePageHeaderContext 注册
- MobileRelationControls 解耦组件（移动端 fixed 菜单栏 + 桌面端 Panel 双模式）
- CSS-first 壳切换（`max-md:hidden`/`md:hidden`），MobileFilterBar/MobileFab 不使用 `useDevice()` 做条件渲染
- 编辑页自动隐藏移动壳层（MobileTopBar + MobileTabBar），编辑器自带 header
- 系统返回键处理（useBackButton）：层级返回——全屏看图/编辑器/弹窗优先关闭 → 非首页 section 回 gallery → gallery 内非默认子 tab 回角色 → 根级才退出 App
- 全局禁止文字选择 + 页面缩放（user-select: none / maximumScale=1）
- 回收站改为浮层弹窗，顶栏带毛玻璃模糊效果

### 展示网站模式（已实现，导出静态站）
- 两区布局：左侧侧边栏（导航） + 右侧内容展示区
- 落地形态是**导出单文件静态站**（`src/lib/export/site/`），不是应用内的第二种外壳：一个 `index.html` 装下内容 / 样式 / 脚本 / 图片（内联 data URI），hash 路由保住深链接，改名 `index.html` 即可发布到任意静态托管，也可离线双击打开

### 通用原则
- 所有操作支持"编辑/浏览"模式切换
- 全局搜索 `Ctrl+K` / `Cmd+K` 唤起，跨模块搜索角色、事件、国家、词条
- 全局保存 `Ctrl+S` / `Cmd+S`
- 配色遵循"界面灰白，内容允许彩色"
- 导航来源追踪：从任意模块跳转到编辑界面时记录来源，返回时恢复 UI 状态

## 4. 功能模块详解

### 4.1 核心数据层（已完成）
- 7 张 Dexie 表：`characters`、`events`、`countries`、`worldEntries`、`tags`、`operationLog`、`periods`
- 每条记录含 `_syncStatus`、`_lastModified`、`deleted` 字段
- 操作日志自动记录字段变更，保留 60 天
- 软删除：设置 `deleted: true`，在回收站保留 30 天

### 4.2 角色工坊（已完成）
- 完整角色信息卡：基本信息、人物简介/生平（DocumentEditor 富文本）、立绘/Q版头像/方形头像/头图管理
- 相关人物关联（含关系标注）、国籍关联国家、按国家筛选
- ImageGallery 立绘 slider + grid、ProfileBanner 头图+头像重叠布局
- **生日**：`年 / 月 / 日` 三段输入（与事件时间同一套 `parseTime`/`assembleTime`，年份可为负），落库仍是 `年-月-日` 一个字符串；年份可解析时会进时间线（见 §4.6）

### 4.3 事件模块（已完成）
- 创建、编辑、排序事件
- 支持时间段（开始时间 + 结束时间），结束时间可选，不填默认持续 1 年
- 时间可输入负数（前 X 年），时间线自动处理排序和显示
- 时间、地点、相关角色/国家、摘要
- **相关事件**：事件之间的关联（`Event.relations: { targetId, relation }[]`），编辑器「关联」区的一行；关系名可留空，落 vault 的 `relations: [{ name, relation }]`，静态站导出为「事件之间」表
- DocumentEditor 富文本正文、@ 角色引用、网格/列表视图，事件卡片头图

### 4.4 国家模块（已完成）
- 国家/地区信息管理：政治制度、地理环境、人文风貌（合并为 DocumentEditor）
- 关联角色与事件、国旗管理
- 卡片预览从 document 字段提取

### 4.5 世界观百科（已完成）
- 树状词条结构（WorldTree + WorldLayout）
- 左侧 280px 可折叠目录树，右侧 DocumentEditor
- 支持 `[[` 词条内链和 `@` 引用
- 拖拽调整层级、内联重命名、新建子条目
- **层级只由 `parentId` 表达**：`src/lib/world-tree.ts` 的 `buildEntryTree()` 是唯一实现，编辑器目录树与静态站导出共用同一份排序，避免两边漂移
- **「分类」字段已删除**：它是自由文本单值、跟树完全无关、功能被标签覆盖；vault 文件里已有的 `分类:` 键保留不动（读回但不显示、写回只在有值时写）

### 4.6 时间线（已完成）
- 年/十年/五十年/百年聚合视图
- 事件时间段渲染为矩形条，拖拽移动整体或拉伸边缘调整开始/结束时间
- 固定中心缩放（滑块 + Ctrl滚轮），滚轮/触控板横向滚动
- 按角色/国家筛选
- 时期条：时间轴上方渲染彩色时期段，支持添加（+ 按钮）、编辑、删除
- **角色出生节点**：生日年份能解析出来时，时间线上出现「某某出生」（空心圆），点击进角色编辑；**不可拖拽**（拖了会去改事件时间）、**不进聚合桶**（点开会跳错）、按国家筛选时不出现

### 4.7 时期（Period）功能（已完成）
- 新建 `periods` 表（DB v4）
- 添加/编辑时期弹窗（名称 + 开始/结束时间 + 6 色盘选色）
- 时期条在时间轴上方渲染，位置/宽度随缩放同步
- 时间重叠的时期自动错行（lane 分配）
- hover 显示 X 删除按钮，点击编辑，右键上下文菜单
- 聚合视图下过短时期自动隐藏

### 4.8 关系图谱（已完成）
- @xyflow/react 可视化网络
- 角色（圆形）/事件（矩形）/国家（方形）节点 + 7 种关系类型连线（含事件之间）
- **拖拽连线新增关系**：从节点上下边缘的圆点拖到另一个节点 → 弹「添加关系」→ 写回实体字段（角色关系 / 事件关系 / 参与 / 属于 / 发生于）；`relationPlan`（`relation-graph-utils.ts`）是「源类型 × 目标类型 → 落哪个字段」的唯一语义表，`services.createRelationBetween` 照它写。国家之间没有对应字段，不支持
  - **成员关系两边都写**：角色↔国家写 `character.countryId`（国籍）+ `country.characters`（相关角色）；事件↔国家写 `event.countries` + `country.events`。只写一侧会出现「拖完只在国家里看到、角色国籍仍为空」。镜像原语唯一实现在 `src/lib/membership.ts`，关系图拖拽与角色/国家/事件三个编辑器的保存共用
  - **方向性关系不镜像**：角色↔角色（师徒/亲属）、事件↔事件（前因/后果）只写在起手的那一端 —— 镜像会把方向弄反
  - 历史数据里只写了一侧的那条边标记为 `data.incomplete`，允许再拖一次补全
- 节点点击跳转编辑页（点在连线手柄上不跳转）
- **力导向布局**：`features/relations/layout.ts` 的 `computeForceLayout`（斥力 + 连线弹簧 + 碰撞半径 + 向心引力，模拟结束后按 1500×1000 回缩再跑碰撞松弛）。只给**没有坐标**的节点算位置，已有坐标钉住；固定随机种子，同一份数据每次同一张图
- **坐标持久化**：拖拽结束写回实体的 `graphPosition`（仓库 frontmatter `graph_position: { x, y }`），不动 `updatedAt`；**localStorage 缓存已删除**（旧缓存会把整张图钉死，导致力导向永远不跑）
- **可读性**：缩放下限 `MIN_ZOOM = 0.6`（画布 / fitView / 滑杆三处共用）；工具面板有 ⟳ **重新布局**（纯图标，整张图重排并把新坐标写回实体）
- **四向落点**：`routeEdges` 按两端节点的相对方位给每条边挑手柄（横向走左右、纵向走上下），贝塞尔曲率 0.15；手柄桌面悬停节点才显形、移动端常显
- 类型筛选 + 缩放控制
- 移动端 MobileRelationControls 解耦组件

### 4.9 编辑器内核（已完成）
- TipTap + 斜杠命令、@ 引用、[[ 词条内链
- 块类型转换、拖拽排序、表格、待办列表
- 段落级 placeholder、plain 模式（去边框去背景）
- ImageBlock 自定义扩展
- DocumentEditor 统一封装

### 4.10 全局搜索（已完成）
- `Ctrl+K` 唤起命令面板
- 跨模块模糊搜索角色、事件、国家、词条
- 按类型分组显示，键盘导航

### 4.11 回收站（已完成）
- 侧边栏底部入口
- 软删除条目按类型分组展示
- 支持恢复（`deleted: false`）和永久删除（物理删除）

### 4.12 数据导入/导出（已完成）
- JSON 格式（`.ocbak`）
- 4 种合并策略：跳过 / 覆盖 / 保留两者 / 清空并导入
- 导入后显示结果摘要

### 4.13 暗黑模式（已完成）
- 白天/夜间/跟随系统三种模式
- 完整设计令牌覆盖
- inline script 防闪烁

### 4.14 桌面应用（已完成）
- Tauri v2 打包，无边框窗口
- Mica/亚克力原生半透明效果（Win11）
- 设置页模糊效果开关
- 单 Webview + Portal 浮层架构

### 4.15 图片系统（已完成）
- 双裁剪引擎：react-easy-crop + react-image-crop，裁剪器带缩放滑块，桌面/移动端双工具栏
- Tauri 持久化：saveBlobToDisk → appDataDir/images/ → convertFileSrc
- Capacitor 持久化：CapacitorAdapter → Filesystem.writeFile (Directory.Data) → getUri → convertFileSrc
- ImageUploader（裁剪流水线）、ImageCropper（全屏）、InlineCrop（编辑器内联）
- ImageGallery（slider + grid）、GlobalAlbum（全局聚合，两级可折叠分类树）
- ProfileBannerEditor（头图+头像），头图比例 3:2
- 全屏查看器 safe-area 适配 + body 滚动锁

### 4.16 设置页（已完成）
- 世界：世界名称、一句话简介、封面（写入单例 `meta` 表）
- 个性化：主题选择、Tauri 自启动开关、窗口模糊效果
- 数据：**由原「数据」+「云」两个页签合并而来**，按类别分区 —— 导入与导出（导入 / 导出 JSON / 发布静态站）、同步（云同步与服务器地址，均未上线）
- 关于：版本号、GitHub 链接、开源许可（二级页）
- **AI 相关入口与代码已删除**（见 §1）
- tab 受控：由 AppShell 持有 `settingsTab` 状态（`defaultTab` 只在首次挂载生效，曾因此出现「点了世界 tab 打开的还是原页签」）
- 页签：世界 / **个性化** / 数据 / 关于（「个性化」原叫「通用」，图标 `Palette`）

### 4.17 右键菜单（已完成）
- 编辑器内：撤销/重做/剪切/复制/粘贴/全选/插入子菜单
- 全局 input/textarea：自定义右键菜单（剪切/复制/粘贴/全选）
- 浮层统一到 #overlay-root
- 桌面端：document `contextmenu` 事件统一处理
- 移动端：`useInputContextMenu()` callback-ref hook，在 input 元素自身绑定 pointerdown/pointercancel/contextmenu/pointerup，不监听 document，避免与 Tiptap/MobileTextSelectionBar 等 7 个组件的事件竞争
- 移动端主触发路径：浏览器 `contextmenu` 事件（原生长按信号）；兜底路径：500ms pointerup

### 4.18 概览（主页）（已完成）
- 首屏：当前世界名 + 一句话简介 + 角色 / 事件 / 国家 / 词条计数（点击跳对应板块）
- 主要角色：`isMajor` 的角色以头像行呈现，点击进编辑器
- 最近更新：四类实体按 `updatedAt` 取前 6 条，显示「类型 / 名称 / 相对时间」
- 空库时显示「从这里开始」快捷新建
- 侧边栏顶部「主页」入口（`activeItem === null` 时为激活态，带 2px 激活竖线）；**移动端不提供该入口**
- 数据依赖：项目元信息（`meta` 表）+ 四类实体列表，均走既有 React Query hooks

### 4.19 Vault 文件夹设定集（已完成，仅桌面 Tauri）

**文件是真源**：一个文件夹 = 一套设定集，词条落成 Markdown + frontmatter，可用 Obsidian 直接打开、用 Git 版本化。

- **自建 Rust 文件 IO**（`src-tauri/src/vault.rs` + 6 个单测；`src-tauri/src/open.rs` 负责用系统浏览器打开外链，2 个单测）：probe / scan / write_texts / write_bytes / import_file / read_bytes / move / remove / mkdir / exists。不用 JS 的 fs 插件（免运行时 scope 授权与跨重启持久化）。含原子写（临时文件 + rename）、mtime 乐观并发、路径逃逸拦截、BOM 剥离、`spawn_blocking`（同步命令会卡死主线程）
- **扫描**（`lib/vault/scan.ts`，641 行）：文件集 → 数据集 + 解析索引 + 体检报告（纯函数，不动磁盘）
- **外科式 frontmatter 读写**：`frontmatter.ts`（只替换我们拥有的键、只替换正文，键顺序与注释原样保留）、`fields.ts`（frontmatter 词汇表唯一源，读与写共用，从结构上消除导入/导出漂移）、`serialize.ts`（未改动就不写 + 跟文件已有键名走，保留 `阵营`/`所属国家` 这类中文键 + 从不整体重写）
- **落盘队列**（`vault-persist.ts`，656 行）：挂在 Dexie `dbcore` 中间件上，`dbcore.table().mutate` 是所有写入的唯一入口，一处接线覆盖全部写入路径；只在事务外做 IO；`deleteRange` 一律忽略（**绝不静默删除文件**）
- **正文桥**（`lib/vault/markdown/`）：Tiptap JSON ⇄ Markdown 双向；无法无损表达的节点附 ` ```oc-document ` 兜底块。`markdown-bridge.ts` 是唯一知道「哪种实体的正文在哪个字段」的地方（**词条在 `content`，其余在 `document`**）
- **启动闸门与界面**（`features/vault/`）：`VaultGate`（装载完成前不渲染主界面，避免空库闪一帧）、`VaultWriteBanner`（写盘冲突非模态提示 + 重试 / 以磁盘为准重载）、`VaultStatus`（状态栏）、`VaultMenuSection`（菜单栏）、`VaultScanReportDialog`（**概览**：一行「N 篇笔记 → 角色 x、国家 y」，正常时只说「没有发现问题」；有异常才出现一条「未知 N 项」，点开才是文件清单）、`VaultSurfaces`、`VaultOverlay`
- **存量图片迁移**（`vault-migrate.ts`）：把应用数据目录里的图片迁进 vault 并改写引用；**显式动作**（菜单里点），不自动执行
- **配套编辑器能力**：`SmallMark`（`<small>` 行内标记，vault 里唯一用到的行内 HTML，实测 32 处）、标题支持 H4（实测 21 个，5/6 级降级到 4）、表格 `rawSeparator`（保留 `|------|` 紧凑写法）、WikiLink `raw` 属性（原文另存以逐字还原）
- **验收脚本**（`scripts/`）：`vault-analyze`（内存往返）+ `vault-frontmatter-check`（逐字节恒等）+ `vault-write-acceptance`（真实文件夹三处改动，sha256 全目录比对，非预期改动必须 0）+ `vault-markdown-check`（正文桥 72 项断言）+ `vault-body-diff`（差异归因）
- **已知规范化边界**（已向用户披露）：被编辑的那一篇块间空行归一到一行、表格单元格内空白、`**A**B**C**` 嵌套 strong 的定界符位置；**未编辑的笔记零改动**

### 4.20 静态展示站导出（已完成）

设置 → 数据 → 「发布为静态网站...」，一键把整个世界导出成**单个 `index.html`**（`src/lib/export/site/`）。

- **一个文件 = 一个可发布的网站**：内容、样式、脚本、图片全内联（图片走 data URI，复用完整备份的取图管线），可直接发布到 GitHub Pages / 任意静态托管，也能离线双击打开
- **hash 路由保深链接**：`#/characters/3`、`#/events/5` 这类地址可直接分享；站点脚本只负责按 hash 显隐 `data-route` 段落，**内容全在 DOM 里**，没 JS 也能读
- **内容覆盖**：概览（世界名 / 简介 / 封面 / 计数 / 主要角色 / 最近更新）、时间线（时期条 + 按年排序事件）、角色、事件、国家、词条（**按词条树的层级分章**：有子项的一级词条当章节标题，子孙条目按深度缩进，零散词条归入末尾「其它」）、关系（角色之间 / 事件之间 / 事件参与）+ 每个实体的详情页
- **正文渲染**（`site/render.ts`，纯函数）：吃 Tiptap JSON（对象或 JSON 字符串）与早期纯文本字段两种形态；覆盖块 15 种 + 标记 7 种；**未知节点只降级不丢内容**；文本一律转义、`href` 只放行 http/https/mailto 与站内 `#/`（导出的文件是要发布出去的）
- **正文内链**（`wikiLink` / `mention`）解析成站内链接，目标已删除时退回纯文本，不产生死链
- **样式**（`site/styles.ts`）：设计令牌取自 `globals.css`，极小圆角（4px）/ 无阴影 / 线只用在区块之间与表格行；`prefers-color-scheme` 自适应暗色；**不依赖 Tailwind**（导出文件没有构建产物）

## 5. 当前进度

### 已完成（2025-05）
- 移动端 Phase 1 完整上线：MobileTopBar（动态标题+动作按钮）、MobileFilterBar（CSS-only fixed）、MobileTabBar、MobileFab、编辑页壳隐藏、backdrop-blur 统一渲染
- 移动端解耦：MobileRelationControls、MobilePageHeaderContext、MobileFilterBar/MobileFab 纯 CSS 控制
- Android 安全区域沉浸：edge-to-edge + CSS 变量 `--safe-top/bottom`，顶栏/底栏/编辑 header/树浮层全适配，MIUI 白条透明
- backdrop-blur 统一修复：header 移入滚动容器内部，WorldLayout/GlobalAlbum/TrashView 全部生效
- 图标规范统一：折叠=ChevronLeft，展开=Menu，返回=ArrowLeft
- 编辑器返回按钮仅图标化（去文字）
- 缩放系统重构：固定中心缩放，滚轮/触控板横向滚动
- 事件时间段：开始/结束时间矩形条，左/右边缘拉伸，sticky 标题
- 时期（Period）功能：periods 表（DB v4），工具栏 + 按钮，时期条渲染，lane 分配
- 全局相册重构：category 精确标记，两级可折叠分类树，搜索增强
- 全局相册侧边栏宽度统一为 120px，选中态颜色规范修正
- 负数年份支持：parseTime/parseYear/normalizeTime/sortEvents 全部适配
- 时间线五十年聚合间隔
- 回收站 Bug 修复：deleted 字段统一为 boolean，恢复后列表实时刷新
- 时间线拖拽后列表实时刷新
- 编辑器时间编辑后自动同步
- 关系图谱 index.ts 补全导出
- 毛玻璃顶栏 + 控件半透明统一 + Portal 浮层隔离
- 图片系统完整上线（双裁剪引擎 + Tauri 持久化）
- 暗黑按钮 hover 全局加固
- 关系图谱（@xyflow/react）
- 统一 DocumentEditor
- 导入增量合并
- 角色/事件/国家/世界观模块
- 编辑器内核
- 暗黑模式
- 全局搜索
- 回收站
- Tauri 桌面打包
- 原生窗口效果
- 浮层系统重建
- 全局 Ctrl+S 保存

### 已完成（Phase 1b，2025-05）
- 移动端触控反馈系统：双层规范（有边框 `touch-feedback` scale(0.96) / 无边框 `active:bg`），覆盖全部移动端可交互控件
- MobileActionSheet：iOS 风格底部弹出菜单（长按触发），统一替换桌面端 hover 删除按钮，覆盖角色/事件/国家/词条树/时间线模块
- 移动端删除二次确认：ActionSheet 删除触发 AlertDialog 确认弹窗（与桌面端 DeleteButton 一致）
- MobileFab 滑动色块动画：网格/列表切换时圆形指示器平滑滑动（transition-[top] duration-300）
- AlertDialog 按钮加 `touch-feedback`，移动端按压反馈统一
- GlobalAlbum 分类树/刷新/折叠按钮触控反馈全覆盖
- 返回/展开/折叠按钮全局触控反馈（编辑页 ArrowLeft、WorldLayout/GlobalAlbum 侧边栏 Menu/ChevronLeft）
- 移动端编辑器键盘适配（完整解决）：`adjustNothing` + `h-screen` 布局稳定 + flex-1 `min-h-0` 修复，光标不跳；移动端键盘工具栏（格式按钮 + 块类型面板），`clientHeight` 计算键盘高度精确定位（放弃不可靠的 `visualViewport.height`）；Capacitor Keyboard 插件集成；**移除 `virtualkeyboardpolicy="manual"` + `Keyboard.show()`**，改用 Android 原生 IME 路径自动弹出（延迟从 ~500ms 降至 ~80ms warm / ~230ms cold）；长按检测 + `dom.blur()` 防止长按误触键盘
- 移动端 World/Album 页面 backdrop-blur 修复：移除 section-fade 的 `max-md:pt`/`max-md:pb` padding（padding 阻断内容经过 fixed bar），改用内部 spacer div；桌面端 section-fade-no-gutter 消除右侧白条；CSS 层叠规则固化（非 layered 样式覆盖 @layer utilities）
- MobileTextSelectionBar：移动端选词工具栏（复制/剪切/粘贴/全选），事件驱动状态机（idle→caret→selection→dragging→action-sheet），epoch 防重、selectionConsumeLock 防异步 selectionchange 干扰，@capacitor/clipboard 原生剪贴板集成，TipTap 空行光标定位修复，ActionSheet z-60 遮罩交互修复

### 已完成（Phase 1b，2025-05 早期）
- Capacitor 图片持久化（CapacitorAdapter + @capacitor/filesystem）
- 裁切器安全区域适配 + 桌面/移动端双工具栏分离
- 移动端跨模块导航修复（mobileNav 同步）
- 编辑器 header 垂直居中优化
- 弹出界面移动端边距统一（AlertDialog/PeriodDialog/SettingsDialog/TrashView）
- 回收站移动端紧凑化（面板/header/body/item 响应式尺寸）
- 设置页 Tab 全宽居中（grid grid-cols-4）
- AlertDialog z-index 提升到 z-[99999]（与 ImageCropper 等对齐）
- 头图比例 3:1 → 3:2（编辑器/列表/裁剪器/占位图）
- 图片上传 blob URL 修复（input.value='' 移至 click 前）
- 全屏查看器 safe-area 适配 + body 滚动锁
- 未标注时间事件从滚动容器移出，始终可见
- useBackButton 单次注册优化（useRef 闭环）

### 已完成（Phase 1c，2025-06）
- 浏览器兼容性检测模块（`src/lib/browser-compat.ts`）：Chromium 版本检测（`getChromiumVersion`）、HarmonyOS/ArkWeb UA 检测（`isHarmonyOS`/`getHarmonyOSVersion`/`isHarmonyOS4`/`isHarmonyOSNext`）、CSS 特性检测（`supportsTransitionBehavior`/`supportsStartingStyle`/`needsAnimationFallback`）
- CSS M114 fallback：`transition-behavior: allow-discrete` 和 `@starting-style` 降级方案（`globals.css` `@supports not` 规则）
- 安全区域降级系统：HarmonyOS/模拟器 `env()` 返回 0 或不准确时自动估算（`estimateSafeAreaInsets` + `isSafeAreaEnvAvailable` + `getSafeAreaBottomCorrection`），resize 监听导航模式切换自动更新底栏高度
- 移动端安全区域 CSS 变量体系：`--safe-top`/`--safe-bottom`（`env()`）+ `--safe-top-estimated`/`--safe-bottom-estimated`（JS 降级），`data-safe-area-fallback` 属性切换
- Xiaomi/MIUI 设备检测：`MainActivity.java` 条件化 `FLAG_TRANSLUCENT_NAVIGATION`（`Build.MANUFACTURER` 检测），非小米设备不再设置此 flag
- 世界观编辑器移动端首次点击光标修复：`EditorCore.tsx` touchend handler 改用 `setTimeout` + `!editor.isFocused` guard + `editor.view.dom.focus()`，避免 `editor.commands.focus()` 覆盖浏览器原生触控光标定位
- Radio 按钮误触发移动端文字菜单修复：`MobileTextSelectionBar.tsx`/`GlobalContextMenu.tsx` 的 `isEditable()` 排除 radio/checkbox/button/file 等非文本 input 类型
- 旧内核键盘高度检测修复：`KeyboardContext.tsx` 通过 `isBelowTargetVersion()` 分支，旧内核改用 Capacitor 插件原生 `keyboardHeight`（扣 safe-bottom + 微调），现代内核路径不变；`EditorCore.tsx` 工具栏/块菜单 safe-bottom 补偿仅旧内核生效
- 旧内核 backdrop-blur 降级：`AppShell.tsx` 设 `data-below-target-version` 属性，`globals.css` 用 `[data-below-target-version] .backdrop-blur-lg` 统一禁用模糊 + 半透明改不透明（亮 `#FEFCF8` / 暗 `#1C1B1A`），39 处组件零改动

### 已完成（stability-update，v0.18.0-alpha 稳定性修复）
- 数据安全：内链弹层 XSS 修复、Tauri 下 HEIF→JPEG 转换丢弃修复、导入加 Dexie 事务回滚、导出/导入补 periods 表、Capacitor 导出 await 化（去假成功）
- 交互缺陷：CountryEditor 无限 refetch、Android 返回键层级返回、`[[` 内链 world 数据源顶层注册、关系图双向边语义去重、桌面右键不再被吞、createCharacter 保留 countryId、标签删除级联清理、`z-60`→`z-[60]`、GlobalContextMenu Provider 上移
- 复用：`data-updated` 魔法字符串收敛为 `src/lib/data-events.ts`（`DATA_UPDATED_EVENT` + `notifyDataUpdated()`）
- 用户反馈修复：命令面板快速新建在编辑态不再"后台创建"（补全板块/移动端导航 + 返回现场 + 未保存确认）；编辑器切换时重置全局保存状态，消除「未保存」误报

### 已完成（tech-debt-cleanup，v0.18.0-alpha 技术债清理）
- 死代码删除：零引用 `EditorToolbar` / `AlbumTriggerContext`、`saveDocument` ×4、`sync.ts` 同步 stub（markAsPending 等）、`Character.relationships` 字段、db v3→v4 空迁移、`adapter.getUrl()`
- 数据层统一：characters / events / world 全部改用 React Query（useQuery/useMutation，列表 30s staleTime + data-updated 刷新，详情 staleTime 0）；`refreshKey` 手写加载已删除
- 泛型 CRUD 仓储原语 `src/lib/repository.ts`：`listActive` / `getById` / `softDelete` 收敛 5 个 service 的重复三件套
- `_syncStatus`/`_lastModified` 写入统一为 `sync.ts` 的 `pendingStamp(now)` helper
- 环境检测收敛 `src/lib/env.ts`：`isTauri` / `isCapacitor` / `isNativePlatform` 单一权威实现（browser-compat 再导出兼容）
- 版本号单源：package.json → `src/lib/version.ts` → SettingsDialog
- 浮层 Portal 统一到 `#overlay-root`：dialog / alert-dialog / FullscreenViewer / ImageCropper / 编辑器弹层 ×4（mention、slash、移动端键盘工具栏+块面板、BlockTypeMenu）

### 已完成（v0.19.0-alpha · 界面重构 + 类型收紧）
- **设计语言统一**：新增 `src/lib/ui-tokens.ts` 作为界面原子类唯一源；极小圆角 3–8px（仅头像/徽章为圆形）、控件零描边（输入改下划线，只有一条底线）；页头统一 48px、标题统一 18px 衬线加粗（`PAGE_TITLE`）、区块标题 15px（`SECTION_TITLE`）；菜单栏 40→32px、状态栏 32→24px；列表页视图切换改为图标（`LayoutGrid` / `List`，默认画廊 + 本地记忆）；浮层去圆角与 ring 光晕，全局按钮 hover 统一为 `var(--oc-hover)`
- **概览（主页）首屏** + 侧边栏「主页」入口（详见 4.18）
- **项目元信息**：DB schema v6 新增 `meta` 单例表 + `src/features/project/` + 设置「世界」tab + 菜单栏显示世界名 + `.ocbak` 备份携带
- **角色 `isMajor`** 主要角色标记（基本信息字段行）
- **取消 Q 版头像**：`qAvatarUrl` 全链路移除（类型 / 服务 / 导出 / 相册分类 / 关系图 / @ 引用 / 种子数据）
- **编辑器「关联 / 标签」改字段行**：`RelatedItemsSelector` 重写为单行内联，「＋ 添加」并入标题行右侧；四个编辑器（角色 / 事件 / 国家 / 世界观）统一
- **类型收紧**：实体 `id` 必填 + Dexie `EntityTable<T,'id'>` + 仓储第 3 泛型位（`Table<T, number, TInsert>`）；`as number` / `as never` **82 → 5**（余 4 处为外部无类型边界：dnd-kit `data`、react-flow `node.data`、自定义事件 `detail`、ProseMirror `attrs`）；导入层 10 处 `as never[]` 收敛为单一 `looseTable()`
- **God 组件拆分（解耦收口）**：全项目已无「真·God 组件」。`TimelineView` **1457 → 445**（`useTimelineLayout` / `useTimelineViewport` / `useTimelineContainerWidth` / `useTimelineDrag` / `usePeriodEditor` + 6 个叶子组件 + constants / utils）、`EditorCore` **1041 → 277**、`page.tsx` **770 → 272**（`lib/use-entity-workspace.ts`）；其余同批：`MobileTextSelectionBar` 766→109、`CharacterEditor` 613→234、`MenuBar` 574→39、`CharacterList` 555→235、`WorldLayout` 502→327、`GlobalAlbum` 504→249、`WorldTree` 501→187、`SettingsDialog` 498→100、`SeedData` 399→17、`EventList/EventEditor` 392/366→189/120、`CountryList/CountryEditor` 370/332→185/188、`ImageGallery` 382→95、`lib/export.ts` 380→barrel、`RelationGraph` 334→283、`ContextMenu` 310→161。顺带清掉 6 条既有 eslint warning
- **本批解耦修掉的两个真 bug**：① 选词工具栏 `ACTION_OPEN` 先 `blur()` 导致 `focusout` 把自己卸载 → Android 触摸下「插入图片 / 表格」菜单永远打不开且工具栏此后失效；② `ImageGallery` 的 `grid + enableCrop`（角色「立绘」用法）裁剪器渲染在 slider 死分支 → 上传是空操作

### 已完成（vault · 文件夹设定集 + 标签颜色 + 静态展示站）
- **Vault 文件夹设定集**（详见 4.19）：文件夹即设定集，Markdown + frontmatter；Rust 自建文件 IO + 外科式读写 + Dexie `dbcore` 中间件落盘 + 启动闸门与写盘提示；4 个验收脚本
- **标签颜色**：`Tag.color` 落库 + `src/lib/tag-colors.ts` 预设色板唯一源（`pickTagColor` 按名字稳定分配、`normalizeTagColor` 收敛非法值）；`TagBadge` 按色值映射到**完整字面量**类名（Tailwind JIT 不能拼接）
- **编辑器配套**：`SmallMark`（`<small>` 行内标记）、标题开放 H4、表格 `rawSeparator`、WikiLink `raw` 原文保存
- **角色 vault 字段**：`faction`（阵营，自由文本）+ `factionId`（按名字解析的软引用）+ `aliases`（别名，`[[ ]]` 解析键，改名时旧名推进这里）
- **静态展示站导出**（详见 4.20）：设置 → 数据 → 「发布为静态网站...」，单个 `index.html` 装下内容/样式/脚本/图片，hash 路由保深链接

### 已完成（词条层级收口 + 概览精简）
- **词条「分类」删除**（详见 4.5）：层级只由 `parentId` 表达，新增 `lib/world-tree.ts` 作为树的唯一实现 —— 编辑器目录与导出共用，顺带修掉「新建词条全是 concept」
- **静态站词条页按树分章**：一级词条当章节标题、子孙按深度缩进、零散词条归「其它」；详情页「分类」换成「上级」链接
- **角色生日改年/月/日 三段**（详见 4.2），年份可解析时进时间线当「出生」节点（详见 4.6）
- **笔记库概览极简**（详见 4.19）：从「扫描报告」改成一个结论 + 一条「未知 N 项」，正常时只说「没有发现问题」
- **设置页签「通用」→「个性化」**（图标 `Cpu` → `Palette`）；新增 `DATE_INPUT` 令牌；**禁用原生 `<datalist>`**

### 待处理
- [ ] 关系图谱节点位置持久化（localStorage）
- [ ] 模板系统（模板切换/保存）
- [ ] 旧数据迁移（bio/lifeStory/system 等旧字段清理）
- [ ] 云同步服务端完善
- [x] 标签系统（标签表 CRUD + `TagPicker` / `TagBadge` + 删除时清理引用；颜色源见 `src/lib/tag-colors.ts`）
- [ ] Vault 后续：Web / 移动端只读或同步（目前仅桌面 Tauri）
- [ ] Vault 规范化边界收敛（块间空行 / 表格单元格空白 / 嵌套 strong 定界符）
- [x] 展示网站导出（单文件静态站，见 4.20）
- [ ] 立绘 slider 鼠标拖拽滑动
- [ ] 上传进度指示
- [ ] 图片从全局相册拖拽到编辑器
- [x] 移动端编辑器键盘适配（工具栏、布局稳定、光标防跳）
- [ ] 移动端 Phase 2：搜索框集成、手势支持、更多编辑器移动端能力
- [x] `id?: number` 精确类型化（实体 `id` 必填 + `EntityTable`；`Event.deleted` 经核查早已是 `boolean`，原记录有误）
- [x] God 组件拆分：**已解耦收口** —— TimelineView / EditorCore / page.tsx 全部完成，且 `≥300 行` 名单里已无「真·God 组件」（剩下的都是抽出来的层或壳，不要为拆而拆）
- [——] **AI：暂不做** —— 相关代码已整体删除；重启需作为新功能重新设计，不要恢复旧实现

## 6. 已知坑与注意事项

### 坑 1：`|| undefined` 导致删除不保存
空串 `|| undefined` → `undefined` → service 的 `if (newValue !== undefined)` 跳过 → 旧值保留。
**已全局清除。**

### 坑 2：全局 `button` hover 规则遮盖图片
`globals.css` 的全局 `button:hover { background-color: var(--oc-hover) }` 覆盖透明按钮。
**修复**：透明按钮加 `bg-transparent hover:bg-transparent`。

### 坑 3：`useCharacter` 不自动刷新
`useCharacter` hook 用 `useState` + `useEffect`，不响应 React Query 的 `invalidateQueries`。
**修复**：`CharacterEditor` 通过 `key={character.id}` + `useEffect` 按 `updatedAt` 同步。

### 坑 4：`resolveImageUrl` 冷启动竞态
`tauriAppDataDir` 未初始化时返回默认占位图。`Providers` 改为非阻塞。

### 坑 5：负数年份输入
时间格式为 `YYYY-MM-DD`，输入负数时需注意 parseTime 已正确处理 `-` 前缀。输入框允许负号，存储为 `-500-01` 格式。

### 坑 6：Capacitor dev server HMR WebSocket 导致 React runtime 崩溃
Capacitor 中配置 `server.url` 指向 Next.js dev server 时，Turbopack HMR WebSocket 在 Android WebView 中持续握手失败（`ERR_INVALID_HTTP_RESPONSE`），导致 React runtime 进入半死状态（DOM 事件正常但合成事件全灭）。
**修复**：生产构建时移除 `server.url`，使用静态导出产物；`touch-action: manipulation` 加在全局 body；`#overlay-root` 避免 `inset: 0` 创建全视口 GPU 合成层。

### 坑 7：Tailwind utility 无法覆盖 globals.css 的非 layered 样式
globals.css 中 `.section-fade` 等非 `@layer` 样式优先级**高于** Tailwind 的 `@layer utilities`。`md:[scrollbar-gutter:auto]` 看似合理但实际不生效。**修复**：同文件后面加同名优先级 class（如 `.section-fade-no-gutter`），或使用 `!important`。

### 坑 9：键盘弹出时切换页面导致 WebView 崩溃（TSB 未 detach display:none 元素）

**现象**：编辑器聚焦 → 键盘弹出 → 点击底部 tab 或返回按钮切换页面 → WebView 崩溃 → "This page couldn't load"。

**根因**：page.tsx 用 `display:none` 切换 section，旧 section 的组件不 unmount → MobileTextSelectionBar 仍持有对旧 editor 内元素的引用（`editableRef.current`）和 ProseMirror 事件监听。切换后旧 editor DOM 不可见（`getBoundingClientRect` 返回全零），TSB 进入 focusin→show→recalcPosition→focusin 死循环，最终 ProseMirror 在事件回调中访问 `view.dom` 时抛出未捕获异常 → Chromium 渲染进程崩溃。

**修复**：
1. `show` 入口守卫：检查 `el.isConnected` 和 `getBoundingClientRect()` 不全是零 → 拒绝跟踪隐藏元素
2. `recalcPosition` 健康检查：已跟踪元素变为不可见时立即 `dismiss()` + 清理 ref
3. `safeGetEditorDom()`：try-catch 包裹所有 `activeEditor.view.dom` 访问
4. 防御层：KeyboardContext rAF 节流、page.tsx 切换前 blur + 50ms 延迟、MobileTabBar 切换前 blur

### 坑 8：BubbleMenu 在软换行边界定位错误（PM position 到视觉位置的不可判定性）
软换行边界上一个 PM position 同时对应两个视觉 caret 位置（行末 + 下一行行首）。浏览器 `getClientRects()` 返回两个 rect，但没有任何规则（left 最小/最大、rect[0]/rect[1]）能覆盖所有场景——从 PM position 反推用户点击的是哪一侧**从理论上不可判定**。在 TipTap BubbleMenu 的 `getReferencedVirtualElement` 里折腾 `coordsAtPos`/`getClientRects`/`bias` 是一条死路。

**正确方案**（EditorCore.tsx）：
- 在编辑器 wrapper 上监听 `onMouseDown`，记录 `clientX`/`clientY` 到 `lastClickRef`
- **光标 collapsed 时**：用点击坐标 + `getComputedStyle` 行高构造虚拟 rect（宽 1px，高为行高，Y = clickY - lineHeight/2）
- **选区非空时**：用 `window.getSelection().getRangeAt(0).getBoundingClientRect()` 获取真实选区 DOM rect，自然跟随拖拽
- Floating UI 的 `placement: "top"` + `offset: 8` + `shift`/`flip` middleware 会自动处理剩余定位

核心认知：**浏览器已经帮我们解决了视觉换行、双向文本、缩放、字体的所有问题。用户点击哪，bubble 就显示在哪。不要试图从逻辑位置反推视觉位置。**

## 7. 快速验证

```bash
npm run dev     # 浏览器验证
npx tauri dev   # Tauri 桌面验证

# Vault 改动必跑（改这块代码前先跑一遍）
npx tsx scripts/vault-analyze.ts "<vault>" --roundtrip        # 内存往返，5 项
npx tsx scripts/vault-frontmatter-check.ts "<vault>"          # 手术原语逐字节恒等
npx tsx scripts/vault-write-acceptance.ts "<vault>"           # 真实文件落盘，非预期改动必须为 0
npx tsx scripts/vault-markdown-check.ts "<vault>"             # 正文桥 72 项断言
cargo test --manifest-path src-tauri/Cargo.toml --lib         # 含 IPC 线格式契约
```

关键验证项：
- 角色/事件/国家/世界观 CRUD → 保存 → 刷新不丢失
- 图片上传/删除/滑动 → 保存 → 刷新不丢失
- Cmd+K 搜索：角色显示 Q版头像，国家显示 flag
- 暗黑模式切换无闪烁
- 关系图谱节点点击跳转编辑页
- 下拉筛选器 hover 半透明效果
- `npm run build` 无报错
- Vault：打开文件夹 → 改一处 → 关闭 → 重开，未编辑的笔记字节不变（以 `vault-write-acceptance.ts` 为准）
- 静态展示站：设置 → 数据 → 发布为静态网站 → 打开下载的 `index.html`，概览/时间线/角色/事件/国家/词条/关系 七项都能进，实体内链可跳，图片已内联
- 词条章节：给两个词条建立父子关系 → 导出 → 词条页应出现章节标题 + 缩进的子条目（层级只跟 `parentId` 走，与「分类」无关）
- 时间线出生节点：给角色填生日年份 → 时间线出现「某某出生」空心圆 → 拖不动、点击进角色
