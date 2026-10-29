# TODO — OC Studio 待办与改进清单

> 本文件记录产品改进建议与后续重构计划。按「交互设计建议」「技术重构」「已知技术债」三块维护，优先级 P0 > P1 > P2 > P3。

---

## 一、界面交互设计建议（为需求服务）

> 已在 `stability-update` 分支实现的标 [x]；用户确认跳过的标 ~~删除线~~；待用户拍板的标 [ ]。

### 暂缓（无限期推迟，不要做）
- [——] **AI 功能**：2026-10 已把 AI 相关代码**整体删除** —— `src/lib/ai/`、`EventAiSummary`、设置里的 AI 页签、`settings.tsx` 的 `ai*` 字段、`useEventForm` 的概括逻辑，一个入口都不留。
  - 不是「排期靠后」：要做得当成新功能重新设计；**不要恢复旧实现、不要留隐藏开关、不在文案里承诺 AI**。
  - 设置页已合并：「数据」+「云」两个页签 → 一个「数据」页签（导入与导出 / 同步 两个分区）；云同步本身也仍是「开发中」，服务端地址只读。

### 已完成（stability-update）
- [x] **未保存更改保护**：`beforeunload` 防刷新/关标签 + 返回键与同类型跨实体跳转弹确认。
- [x] **保存状态可见**：StatusBar 显示「未保存 / 保存中 / 已保存」。
- [x] **保存快捷键去 hack**：`Ctrl/Cmd+S` 改为 `requestSave()` 显式命令。
- [x] **命令面板（Ctrl/Cmd+K）**：快速新建（角色/事件/国家）+ 切换板块（7 个板块）；实体搜索跳转原本已有。
- [x] **词条编辑体验统一**：删除死代码 WorldEditor（HTML 路径），World 内容统一为 TipTap JSON。
- [x] **关系图增强**：悬停聚焦高亮邻居 + 图例；类型筛选/节点头像/双指缩放原本已有。
- [x] **相册素材库（部分）**：类型过滤（已有）+ 标签过滤 + 按更新时间排序。
- [x] **完整备份（.ocbak）**：图片内联为 data URI，换机可移植。原来还有一项「JSON（不含图片）」，已删除 —— 备份只留这一种格式。
- [x] **空状态引导**：全站已有（角色/事件/国家/词条/图谱/时间线/相册），无需改。
- [x] **设计语言统一**：新增 `lib/ui-tokens.ts` 作为唯一原子类源（字段行 / 标题 / 按钮 / 输入 / 浮层 / chip / 空态）；控件零描边（输入改下划线）、页头统一 48px + 标题统一 18px 衬线、浮层去 ring 光晕；列表页视图切换当时改为「画廊 / 目录」文字（后来又改回图标，见下）。<br>（原「零圆角」已被下条**极小圆角**取代）
- [x] **概览（主页）首屏**：世界名 + 一句话简介 + 角色/事件/国家/词条计数 + 主要角色 + 最近更新；侧边栏顶部新增「主页」入口（`activeItem === null`）。数据层配套：项目元信息（DB v6 `meta` 表 + `features/project/` + 设置「世界」tab）与 `Character.isMajor`。
- [x] **编辑器「关联」排版**：相关角色 / 相关国家 / 标签改为字段行；`RelatedItemsSelector` 重写为单行内联，「＋ 添加」并入标题行右侧；四个编辑器（角色/事件/国家/世界观）同一套网格。
- [x] **圆角回归 + 菜单密度（2026-10）**：撤掉「零圆角」——改为**极小圆角**，四个语义名入 `globals.css` 的 `@theme`（`rounded-item` 3px / `media` 4px / `menu` 6px / `panel` 8px），`--radius: 5px` 供 shadcn 派生类；`ui-tokens` 新增 `ROUND_*` 与 `MENU_ITEM_BASE`。所有弹出菜单（右键 / 下拉 / 筛选 / @ / / / 命令面板 / 移动端选词栏）改为 macOS 观感：容器**只留 `py-1`、去掉左右内边距**，行自带 `px-3`、行高 `py-1`，hover **横向铺满、左右不留缝**。顺带把 `features/timeline/components/FilterSelect` 收敛成 `shared/FilterSelect` 的薄封装，删掉 4 处各自拼写的菜单项类名。规范写在 `AGENTS.md §核心约束 2` 与 `oc-studio-design` skill 的「圆角与阴影 / 浮层面板 / 下拉菜单 / 右键菜单」。
- [x] **强调色预算 / 圆形控件 / 标签字段（2026-10 下半场）**
  - 强调色收紧：`BTN_PRIMARY` 从实心墨色改浅底（保存 / 新建 / 确认全跟着变）；重复拼写的 9 处主按钮类名收进令牌。一屏之内不再出现第二块深色。
  - 圆形控件：开关（胶囊轨道 + 圆滑块）、主题单选（圆 + 圆点）、滑杆拇指、事件「主要」标记点、菜单单选圆点、标签色点。
  - 视图切换改回图标（`LayoutGrid` / `List`，`h-8 w-8`）。
  - 标签字段：只显示**当前实体已有**的标签（原来把全库几百个标签铺在表单里）；其它靠关键词搜索（上限 40）+「新建」入口；chip 右侧**常显** ×（不再 hover 才出现）；面板挂在输入 chip 上，不再被前面的标签挤到行首。实体已保存的标签 chip 不再用强调色。
  - 关于页：`访问 GitHub 项目` 走 `open_external`（Tauri 里 `target="_blank"` 点不动）；新增 31 项开源致谢（`settings/credits.ts`，许可证取自各自 package.json / Cargo.toml）；列表定高自滚动，设置弹窗整体限高（`max-h-[calc(100vh-4rem)]` + 内容区自滚）。
  - 修 Mica 被设置页关掉：`GeneralTab` 原先把 `init_blur(enabled: false)` 当能力探针，等于每次打开设置就 `clear_mica`；新增纯查询命令 `blur_supported`。
  - 文案：界面里 Vault → **仓库**（代码仍叫 vault）。
- [x] **外壳细节（2026-10 下半场）**
  - 菜单栏 / 状态栏 / 侧边栏之间去线，三块共用一张表面；内容区改成一块 `bg-paper` + `border` + 6px 圆角的浮纸；窗口控制按钮的上/右内缩统一为 4px；Mica 恢复（底色只由 `globals.css` 的 `[data-*]` 规则给）。
  - 相册分类树的行改「满宽条」：容器不留左右内边距，悬停 / 选中铺满整行，圆角仍是小档 4px。
  - **侧边栏宽度可拖**：默认 140px，右边缘 6px 命中区（悬停显浅底、不画线），范围 112–168px（0.8–1.2 倍），双击复位；常量在 `src/lib/sidebar-width.ts`，宽度存 `settings.sidebarWidth`。
  - 「视图」菜单移除「浏览模式」（`settings.editMode` 删除）。

### 待做（2026-10 用户反馈）

> ③ 已完成；① 放最后（② 的剩余项见下方进度）。每条记了「做法」与「待定」，**待定项没拍板前不要开工**。
> **排期（2026-10-28）**：① 放最后。左栏已定「搜索 + 国家分组并存」（见下）；编辑器工具栏与 Markdown 最小集见 `docs/编辑器工具栏设计.md`。布局草样见 `sample/three-column-editor/index.html`。
> 前提变更：**浏览器模式已取消**，存储只需考虑「仓库（文件夹）」与「内置数据库」，且都在桌面壳内。

- [ ] **① 编辑界面分区折叠（2/3 栏）** —— 用户要“像那类三栏编辑器”：左=条目列表、中=元数据、右=正文。**排期：放最后（2026-10-28）**；布局草样见 `sample/three-column-editor/index.html`，工具栏设计见 `docs/编辑器工具栏设计.md`。
  - 关键决定：**三个区域各自可折叠，不是两套页面**。断点 `≥1500` 三栏（列表 220 / 元数据 340 / 正文余量）· `1280–1500` 列表折成 44px 图标条（两栏）· `<1280` 列表变抽屉、元数据收到正文上方（单栏）
  - 手动切换覆盖断点默认值并记住（localStorage）；快捷键 `⌘/Ctrl+B`；展开方式 `≥1500` 推开、`<1500` 浮层（否则正文被挤到不能读）
  - 中栏收**全部 frontmatter + 上传物**（封面 / 头像 / 立绘 / 相册 / 字段 / 标签 / 关联）；右栏**只放正文**。左栏与中栏各自独立滚动、各自 sticky 头（滚动容器不得加 padding，见 AGENTS §核心约束 9）
  - 左栏复用列表页的 **Row 变体**（名字 + 副标题），不要塞卡片；不要把列表页整个搬进来（搜索/分组就够）
  - 落地顺序：① 中间栏（全部元数据 + 上传物）→ ② 可折叠左栏 → ③ 切换即自动保存（改行为语义，最后做）
  - 已定（2026-10-29）：左栏**同时保留搜索 + 国家分组**（搜索常驻、分组默认开，组头可折叠）；不再二选一。
  - **进度（2026-10-29 收尾）**：查找替换 / 链接 / 桌面格式工具栏 / 大纲 / 图片粘贴拖拽 + 压缩 / 粘贴清洗已落地（`FindReplaceBar`、`LinkPopover`、`EditorToolbar`、`OutlinePanel`、`useImagePasteDrop`、`image-compress`，见 `docs/编辑器工具栏设计.md`）；角色 / 事件 / 国家的 frontmatter/正文分栏 + 多栏/全屏/自动设置已落地，世界观复用同一壳但单列（不分栏）；顶栏 48px / 覆盖层模糊 / 工具栏组居中、主格式外露、无文字标签、保存按钮保留文案；编辑器标题移出顶栏、实体名加粗；列表统一世界观样式（`< 标题 +` + 独立搜索行 + 展开动画）、默认 200px 可拖 160–240、编辑器与相册宽度共享；返回键回列表；脏状态诊断（仅 dev 日志）、任务列表复选框与封面文案已收口；①「切换即自动保存」已实现（布局切换先存后切）。**大纲搁置：等小说 fork 合并后一起做**；Ctrl+B/K 键位仍待定。
- [ ] **② 字段自定义（增 / 删 / 改名 / 排序）** —— “有的世界观用不到种族/元素”，用户要的是**想加就加、想删就删**，不是单向隐藏
  - 一张**字段表**按实体类型分（角色 / 事件 / 国家 / 词条），每行 = 显示名 + 类型 + 键；表单照着表渲染，删一行就消失、加一行就多一个输入框
  - 配置存 `.ocstudio/fields.json`（与 `.ocstudio/tags.json` 同构、跟库走）；内置数据库模式存 `meta`。范围 = **当前库 × 该类实体的全部条目**（不是只对新条目生效）
  - 内置字段沿用原列 / 原 frontmatter 键，**零迁移**；自定义字段的值：内置库进实体的 `custom` 对象（Dexie 存对象，不动 schema），仓库写 frontmatter（一个字段一个键）
  - **改名只改显示名，不动键**（`种族` → `血统`，文件里仍是 `race:`）。连键一起改 = 批量改写所有文件，属于危险动作，另做且带预览
  - 删字段 = 从表里移除、数据留着（可恢复）；要抹数据是独立的「清空该字段的值」开关，不在第一版
  - 入口：设置 › 世界 › **角色基本信息**（同类段落：事件 / 国家 / 词条）挂字段表 —— 行内改名、加字段、删字段、调顺序；表单里字段行 hover `⋯`，表单底部灰字「已隐藏：种族、元素」可点开
  - 硬约束：删除 / 隐藏**只影响渲染**，表单 state 仍全量加载与保存（`writeString('')` 会删键，不加载就等于“保存即清空”）；仓库写回对未编辑的键一个字节都不动
  - 落地顺序：① 字段表 + 存储 → ② 角色表单改成数据驱动 → ③ 事件 / 国家 / 词条 → ④ 设置页
  - **进度（2026-10-27）**：① ② ④ 已完成 —— `lib/fields/`（表 + 默认目录 + 存储 + 订阅）、角色/事件/词条表单已数据驱动、设置 › 世界 › 表单字段 可改名/上下移/删除/自建/加回内置/恢复默认；自定义字段的值走 `custom` 对象，仓库模式读写 frontmatter（键 = 字段名）。**未做**：字段行 hover `⋯` 的快捷隐藏；自定义字段目前只支持「单行文本」；国家没有独立字段行（体制/地理/文化并进正文了），暂不开放字段表；删掉的自定义字段只能在数据里找回（键仍在，但设置里没有「找回」入口）
  - ~~模板新建「以此为模板新建」~~：用户 2026-10 明确否掉 —— 只要字段能加删改，不需要模板那套
- [x] **③ 创作时间线（保存即留痕）** —— 用户反馈：想有“时间节点”，被指抄袭时能讲清过程（2026-10-28 已完成，见下面的进度）
  - 范围：**只做只读列表 + 导出**。不做回滚、不做 diff、不做全文快照
  - 存 `.ocstudio/journal.jsonl`，一行一条、**只追加**：`ts / kind / relPath / title / 改了哪些键 / 内容 sha256 / prevHash`
  - 写入点：现有落盘 flush 里追加一行（那里本来就知道“谁变了、改了哪些键”）；「新建」也记一条（“什么时候开始写的”最常被问）
  - UI：实体页头 `⋯ → 历史` 弹层（倒序列表 + 导出 JSON，供截图/发送）；世界级汇总视图以后再说
  - 待定：内置数据库模式要不要也记（可复用已有 `operationLog` 表）；**倾向只要仓库**
  - **进度（2026-10-28）：已完成**。「只做仓库」定案（没有文件夹就没有日志，按钮直接不渲染）。
    - 后端：`src-tauri/src/journal.rs` 两条命令 `journal_append` / `journal_tail`（只追加、拒绝路径逃逸、行内换行压平、5 个单测）
    - 前端：`src/lib/vault/journal.ts`（行格式 + sha256 + tail 解析 + JSON 导出）、落盘 flush 里对**每一次真正写成功的改动**追加一条（新建 / 保存 / 移入回收站 / 还原 / 彻底删除）
    - UI：角色 / 事件 / 国家 / 词条四个编辑器页头多了 `历史` 按钮 —— 倒序列表（时间 · 种类 · 改了哪些键）+「导出 JSON」（带 `version` 的凭据文件，不做第二套格式）。没有文件夹、或这篇还没落过盘时按钮不出现
    - 自检：`npx tsx scripts/journal-check.ts`（16 项：解析 / 过滤 / 文案 / 时间格式 / 导出）
    - **未做**：世界级汇总视图（全库时间线）；改名后历史会从新路径重新开始（只在 relPath 上匹配）
    - 已知代价：每次 flush 对改动过的文件多算两次 sha256（新内容 + 旧内容），笔记都是 KB 级，可忽略；日志本身只追加、不压缩
- **已排除的方案（别再提）**
  - 写进 frontmatter 的 `last_saved` / `history: []`：跟着文件一起被拷走，**零举证价值**，还会污染用户精修的 YAML
  - 读文件系统 mtime 当“创作时间”：只能表达“最后一次”，且我们的原子写（temp + rename）会重置 `CreationTime`；它只配做展示，不配做记录
  - 让用户学 git / commit / push：给画师的工具不该要求这些；将来顶多做“后台自动 commit”的高级开关

### 已完成 · 关系图布局与坐标持久化（2026-10-28 规格书）

> 规格书原稿《关系图布局与图片导出 v0.19.0-alpha》。**本轮只做 Phase 1–2（布局 + 坐标）**，导出（Phase 3–4）暂缓，技术要点记在最后一节，别丢。
> 与规格书的差异（已定，不再讨论）：① 不引 Zustand —— 坐标走现有 service + React Query，不引第二套状态库；② 不用 `graphX` / `graphY` 两列，实体上一个 `graphPosition: { x, y }` 对象，正好对上 frontmatter 的 `graph_position`；③ 角色 / 事件 / 国家**三种节点都持久化**（只存角色的话，事件与国家每次重开都会重排）；④ **localStorage 缓存整个删掉**（见下）。

**问题**：节点一多，头像互相压住、连线从节点身上穿过去；布局只存在 localStorage，换机器 / 重开仓库就丢。

**目标**：力导向 + 碰撞检测算出初始布局；用户拖过的位置写进实体（仓库写 frontmatter），重开还在。

- [x] **P1 力导向布局**（新增依赖 `d3-force` + `@types/d3-force`）
  - `src/features/relations/layout.ts`：`computeForceLayout(nodes, edges, { pinned })` 纯函数 → `Map<nodeId, { x, y }>`
  - 力模型：`forceLink`（用现有边；距离 150 / 强度 0.6）+ `forceManyBody(-180)` + `forceCollide(半径 + 12)` + **向心引力 `forceX/forceY` 0.09**（没有它孤立节点会一路往外飘，图被摊到几千像素、fitView 只能缩到 0.2）
  - 引力中心：有钉住节点时朝**锚点质心**聚（新节点落在已摆好的那坨附近），否则朝原点
  - **不摊太大**：模拟结束后按 `TARGET = 1500×1000` 回缩一次（只在「全是自由节点」时做，有锚点时不缩放，否则会把用户摆好的位置一起挪走），回缩后再跑 60 步纯碰撞把压在一起的推开
  - 碰撞半径按节点形态给：角色 / 国家 52（56 头像 + 名字），事件 64（矩形更宽）；d3 给的是圆心，换算成 React Flow 的左上角时减掉半个身位（`NODE_SIZE`）
  - **确定性**：初始位置按圆周均分 + `randomSource(mulberry32(0x9e3779b9))`，`simulation.stop()` 后同步跑 300 tick —— 两次结果逐字节一致
  - 只给**没有坐标**的节点算位置；钉住的节点原样返回
  - 实测（真实 `computeForceLayout`）：13 节点 497×529、25 节点 717×705、40 节点 964×892，最近一对间距 +23~24px（即碰撞半径生效、无重叠）
- [x] **P2 坐标双轨持久化**
  - `Character` / `Event` / `Country` 加 `graphPosition?: { x, y }`（`src/types/index.ts` 的 `GraphPosition`）
  - 仓库键 `graph_position`（键链 `graph_position` / `graphPosition`）；`serialize.ts` 有值才写、未改动不写（`sameDiskValue` 补了对象比较，否则每次保存都会重写这个键），`scan.ts` 读回
  - 拖拽结束（`onNodeDragStop`）→ `saveNodePosition()` 写回实体：`graphPosition` + `pendingStamp`，**不动 `updatedAt`**（排版不算编辑，不该窜到「最近更新」最前面）
  - 没升 Dexie 版本（`graphPosition` 不是索引字段）
- [x] **P3 可读性（用户反馈追加）**
  - **删掉 localStorage 缓存**：旧版把径向布局的坐标写进 `oc-relation-node-positions`，结果整张图被钉死、力导向永远不跑（用户实测「看不出任何变化」）。现在坐标只认实体，没有就现算 —— 力导向是确定性的，重算结果稳定，缓存没有存在意义
  - **缩放下限 `MIN_ZOOM = 0.6`**：画布 `minZoom`、`fitView` 的 `minZoom`、缩放滑杆三处共用。再小人脸和名字就看不清了，看不全就让用户自己平移
  - **连线四向落点**：节点上 / 右 / 下 / 左四个手柄（Loose 模式，任一端都能起手），`routeEdges()` 按两端节点的相对方位给每条边挑手柄（横向走左右、纵向走上下）；贝塞尔曲率 0.25 → 0.15。之前所有线都从正下方一个点挤出来，贴着节点糊成一束
  - 手柄桌面**悬停节点才显形**（`md:group-hover`，节点带 `group`），移动端常显；可落点时填墨（`.valid`）
  - 工具面板加 **⟳ 重新布局**（纯图标，桌面 / 移动端同一形态）：无视已有坐标整张图重跑，并把新坐标写回实体 —— 不写回的话下次打开又弹回旧位置
- **验收**：`tsc` / `eslint` / `npm run build` / `npm run audit:design` / `npx tsx scripts/vault-migrate-check.ts` 全绿；布局几何用临时脚本量过（上表）；真机观感由用户确认
- **已知取舍**：图很大时（>40 节点）默认视图看不全，需要平移 —— 这是「宁可少看一点，也不要糊成一片」的代价

#### 导出（暂缓，先记技术要点）

- 角色卡：`html-to-image` 的 `toPng()` + 隐藏的 800×1200 模板；Tauri 本地图片必须先转 data URL（`image-service` 已有三环境适配），否则 canvas 被污染、导出空白
- 整图：React Flow 的 `getNodesBounds` + `getViewportForBounds` 算包围盒，对 `.react-flow__viewport` 出图，而不是截当前视口
- 落盘：`src-tauri/src/files.rs` 目前只有 `save_text`，导出 PNG 要加 `save_bytes`（照现有「同目录临时文件 + rename」写，带单测）
- 水印：默认「Created with OC Studio」，不硬编码作者名

### 已完成 · 单真源迁移收口（2026-10-28）

> 目标：一个文件夹 = 一套设定集，应用内那份只是本次会话的缓存。这一轮把「老数据怎么无损地落进文件夹」和「落盘为什么没写下去」一起收掉了。
> 施工蓝图与验收清单见 `docs/迁移计划.md`；回归口径 `npx tsx scripts/vault-migrate-check.ts`（31 项断言）。

- [x] **落地迁移器** `lib/vault/export-dir.ts`：Dexie 全量物化成笔记 + 图片 + `tags.json` + `fields.json` + 标记文件。笔记从零写全量（`prev` 传 null），路径一律走 `allocateRelPath`
- [x] **目标文件夹可以已有笔记**：合并策略（跳过 / 覆盖 / 保留两者 / 清空并导入）原样作用到同名文件上；`覆盖` 是外科式改写（只动我们拥有的键与正文，用户自造的键与注释保留），`清空并导入` 只是把旧笔记挪进 `.ocstudio/trash/`，**从不删文件**
- [x] **入口统一**：闸门底部一个分裂按钮 —— 左半「导入旧版本数据」直接落地，右半箭头下拉「导入旧版本备份」；选到已有笔记的文件夹先问策略。选项抽成 `components/shared/merge-strategy.tsx`，导入对话框与落地对话框共用一份
- [x] **落盘中间件补 response 主键**：不带 id 的 `add` / `bulkAdd` 的主键只有 response 的 `results` 里有 —— 以前漏了它，**新建实体与「保留两者」导入的行只在 Dexie 里活着，磁盘上没有**
- [x] **单条失败不连坐**：坏行记错并留在队列等「重试保存」；`writeString` 容错 `undefined`（旧备份缺字段时最容易炸）
- [x] **写盘超时 + 看门狗**：每次 IPC 20 秒超时，门闩卡住 30 秒自动复位并把错误上屏 —— 状态栏不会再无限转圈
- [x] **「保存中…」永不结束**：三处表单 `handleSave` 补 `catch`（报原因 + `reportDirty(true)`），`markSaving` 加 20 秒兜底
- [x] **无损补齐**：`bio` / `lifeStory` / `summary` / 事件 `relations` 进词汇表；时期可从 `时期/*.md` 读回（`dataset.periods` 以前是硬编码空数组）；多行值强制双引号转义
- [x] **图片三种来源一起搬**：字段、正文 `imageBlock`、`data:` URI；搬不动的在提示里报「N 张图片找不到原件」。**删掉「把旧图片收进文件夹」** —— 那套只认字段，会搬一半
- [x] **备份只有一种**：删「JSON（不含图片）」，菜单与设置统一为「完整备份（.ocbak）」，`exportAllData` 退回内部第一步
- [x] **启动恢复**：只看「上次打开过的路径」。`isVaultEnabled()` 的标记从来没被写入过，导致每次刷新 / 热重载都落回欢迎页
- [x] **闸门期的反馈**：`Toaster` 与 `NativeMenuBlocker` 提到 `VaultGate` 外面（闸门在 `AppShell` 之外，之前的提示与右键拦截都够不着）

### 下一步（建议顺序，2026-10-28）

> 迁移这条线刚收口，**先把它在真实库上验完**，再动新功能；顺序按「风险 × 影响」排。

- [ ] **A. 迁移验收 + 导出前一致性检查**（半天，风险低，做在功能前面）
  - 按 `docs/迁移计划.md §7` 在真实库上逐条过：关掉重开回到同一库、Obsidian 改一篇后「刷新」能看到、迁移后立刻编辑**不报 mtime 冲突**、旧图片全部进 `附件/`（全库 `images/…` 引用应为 0）
  - 待补代码：导出前比对磁盘 mtime，发现外部改动时提示「建议先重新载入」（现在只 `flush()`，并不知道磁盘被谁改过）
- [x] **B. 创作时间线（下面的 ③）** —— 已完成（2026-10-28）：`journal.jsonl` 只追加 + 四个编辑器的「历史」弹层 + 导出 JSON。剩下「世界级汇总视图」以后再说
- [ ] **C. 三栏折叠编辑界面（下面的 ①）** —— 改动最大，放最后。布局草样：`sample/three-column-editor/index.html`；编辑器工具栏与 Markdown 最小集：`docs/编辑器工具栏设计.md`。左栏已定「搜索 + 国家分组并存」。

### 已跳过（用户确认不做）
- ~~编辑/浏览模式~~：2026-10 从「视图」菜单**移除**（阅读态开关不做，`settings.editMode` 一并删掉）。正文只读靠导出与静态站，不再有第二种模式
- ~~时间线移动端可编辑~~（点击时间已进编辑，且移动端交互不便）
- ~~标签交互~~（没必要）
- ~~快捷键可发现性提示~~（没必要）

### 已跳过 / 暂不做（用户确认）
- ~~相册批量操作~~：用户确认暂不做。

### 待定
- [ ] **命令面板合并移动端搜索**：MenuBar 搜索与 MobileSearchOverlay 合并为统一组件。

### 其他打磨（P3）
- [x] 移动端断点缺口（640–768px）：`MenuBar` 内部菜单组原为 `hidden sm:flex`，与外壳 `max-md:hidden`（Sidebar/StatusBar/MobileTopBar 统一 768）不一致 → 已对齐为 `md:`。
- [x] 移动端选词栏滚动跟随非首段：`MobileTextSelectionBar` 原 `querySelector('.section-fade')` 写死第一个滚动容器（仅事件页生效）→ 改为 document 捕获阶段监听滚动，覆盖所有 section。

---

## 二、技术重构（独立 PR，风险较高）

### P2 — 数据层
- [x] **统一到 React Query**：characters / events / world 已改为 useQuery/useMutation（与 countries 同构）；列表 30s staleTime + data-updated 事件刷新，详情 staleTime 0 防跨模块写入读到旧值。`refreshKey` 已删除；`data updated` 事件总线保留（trash/import/periods/timeline 等跨模块刷新依赖）。
- [~] **泛型 CRUD 仓储**（部分完成）：`src/lib/repository.ts` 已收敛 listActive/getById/softDelete 三件套到 5 个 service；剩余 create/update 因字段级日志与引用同步差异仍各自手写，可进一步抽取带配置的 update 模板。
- [ ] **World `content` 单格式迁移**：HTML 路径已删（WorldEditor），现为 JSON 字符串（active）+ `document` 对象（unused）两形态，可进一步收敛到 `document`。

### P2 — 组件拆分（God 组件）
> 本轮解耦已收口：全项目再无「真·God 组件」，`≥300 行` 名单里剩下的都是本轮抽出的层或壳（`use-entity-workspace` 620 / `TimelineView` 445 / `WorldLayout` 327 / `useTimelineViewport` 304 / `seed/index` 309），**不建议再拆**。

- [x] `features/timeline/components/TimelineView.tsx`：**1457 → 445**。`hooks/useTimelineLayout`（纯派生：坐标/泳道/刻度/聚合桶）、`hooks/useTimelineViewport`（滚动/缩放/捏合/导航）、`hooks/useTimelineContainerWidth`（ResizeObserver）、`hooks/useTimelineDrag`（拖拽落位）、`hooks/usePeriodEditor`（时期增删改 + 长按面板）+ `components/{TimelineToolbar,EventNode,FilterSelect,PeriodBar,BucketView,EmptyTimeline}` + `constants.ts` / `utils.ts` / `types.ts`。顺带把工具栏 props 从三份重复收敛为一份。
- [x] `src/components/editor/EditorCore.tsx`：**1041 → 276**。`editor-config.ts`（配置构建）、`editor-context-menu.tsx`、`mention-render.ts`、`BubbleMenuButtons.tsx`、`MobileEditorToolbar.tsx`、`editor-mobile-events.ts`（`mobile:*` 命令绑定）、`useEditorBubbleMenu.ts`、`useEditorMobileInput.ts`。
- [x] `src/app/page.tsx`：**770 → 272**，抽出 `src/lib/use-entity-workspace.ts`（视图路由 / 返回栈 / 未保存守卫 / 滑动动画 / 词数）。
- [x] 同一轮次其余：`MobileTextSelectionBar` 766→109（`shared/mobile-text-selection/` 7 文件；**修 `ACTION_OPEN` 顺序 bug**——Android 触摸下插入/表格菜单打不开且工具栏卡死）、`CharacterEditor` 613→234、`MenuBar` 574→39（+`MenuBarMenus` / `WindowControls` / `MenuBarSearch`）、`CharacterList` 555→235、`WorldLayout` 502→327（+`useWorldEntryDraft` / `WorldTreePanel`）、`GlobalAlbum` 504→249、`WorldTree` 501→187、`SettingsDialog` 498→100、`SeedData` 399→17、`EventList` 392→189、`ImageGallery` 382→95（**修 grid+裁剪下上传空操作 bug**）、`lib/export.ts` 380→barrel（`export/{payload,markdown,download}`）、`CountryList` 370→185、`EventEditor` 366→120、`CountryEditor` 332→188、`RelationGraph` 334→283、`ContextMenu` 310→161。顺带清掉 6 条既有 eslint warning；两个筛选下拉（`CountryFilterSelect` / `AlbumTagFilter`）合并为 `components/shared/FilterSelect`。

### P3 — 死代码清理
- [x] `saveDocument` ×4（characters/events/countries/world）
- [x] `sync.ts` 的 `markAsPending` / `markAsSynced` / `getPendingItems`（同步 stub）
- [x] `WorldEditor.tsx`（已删除）
- [x] `EditorToolbar.tsx`、`AlbumTriggerContext.tsx`（零引用）
- [x] `Character.relationships` 字段（实际用 `relatedCharacters`）
- [x] `db.ts` v3→v4 无操作迁移
- [x] `adapter.getUrl()`（local-adapter / capacitor-adapter）

### P3 — 一致性
- [x] 环境检测抽 `lib/env.ts`（`isTauri` / `isCapacitor` / `isNativePlatform` 单一权威实现，browser-compat 再导出兼容）
- [x] 版本号单源（package.json → `lib/version.ts` → SettingsDialog；文档随发布同步）
- [x] 浮层 Portal 统一到 `#overlay-root`（`dialog.tsx` / `alert-dialog.tsx` / `FullscreenViewer` / `ImageCropper` / 编辑器弹层 ×4：mention 弹层、slash 弹层、移动端键盘工具栏+块面板、BlockTypeMenu）
- [x] `id?: number` → 精确类型：实体 `id` 收敛为必填 + Dexie 4 `EntityTable<T,'id'>`（读出行 id 必为 number、写入时 id 可省）；顺带修正 `lib/repository.ts` 的泛型位 —— 原先 `Table<T, number>` 会把推断出的 T 统一成 `InsertType`（写入态），是全局 `as number` 的根源。断言 **82 → 5**（余下 4 处为外部无类型边界：dnd-kit `data`、react-flow `node.data`、自定义事件 `detail`、ProseMirror `attrs`）。导入层 `as never[]` ×10 一并收敛为单一 `looseTable()` 断言点。

---

## 三、已知技术债（继承自 AGENTS.md）
- [x] 桌面/移动端折叠展开图标规则同步到 RelationGraph 的 Controls（核查后确认 RelationGraph 未用 @xyflow/react 默认 Controls，已自定义 lucide 控件，此项已过时）
- [x] `_syncStatus` 写入逻辑各 service 手写，已统一为 `pendingStamp()` helper
