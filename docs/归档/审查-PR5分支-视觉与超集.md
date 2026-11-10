# 审查：`feat/intake-pr5` 的视觉一致性与 PR #5 超集判定

> **已归档 2026-11-10** —— 一次性审查（2026-11-03，对象 `7607fcf`），结论已全部执行：§5 的 17 项修复进了
> `review/pr5-ui`（`307f708`）并合回主线，§3 的能力缺口全部补齐（见同目录 `PR5-收尾计划.md` 顶部的归档说明）。
> 留档价值只剩一处：§2 的视觉问题清单是「同类控件只有一份实现」这条原则的原始证据。

> 2026-11-03。对象：分支 `feat/intake-pr5`（HEAD `7607fcf`，含当时工作区的未提交改动）。对照：`pr-5` @ `ca9c025`（worktree `../oc-pr5`）、`docs/PR5-拆解清单.md` §4.2 能力矩阵、`docs/待设计决策清单.md`、`oc-studio-design` skill。
>
> 方法：① 静态检查（`tsc --noEmit` / `eslint` / `audit:design` / `audit:theme` / 构建）；② 在**隔离 worktree**（`../oc-review`，`node_modules` 用 junction、webpack 构建）里跑静态导出并用 CDP 截图；③ 逐文件对照 PR 与文档；④ 4 个只读子代理分别深挖关系图 / 小说 / 地图 / 角色与媒体。
>
> 截图：`logs/review/shots/`（`logs/` 已 gitignore，本地查看）。修复所在分支：`../oc-review` 的 `review/pr5-ui`（从 HEAD 拉出，不碰主工作区）。

---

## 0. 一句话结论

> 下面是**审查时（HEAD `7607fcf`）的快照**；其中 17 项已在 `review/pr5-ui` 修掉（§5），但**修的是「已有的东西不别扭」，不等于能力已经补齐** —— 仍未达标的部分见 §3 / §6。

- **视觉**：新功能**没有穿过同一套设计系统**。`audit:design` 是 0 违规，但它只查字面量，查不到「页头档位错、胶囊、Portal 缺失、选中态缺失、两套右键菜单、两套编辑器壳」这类语义问题。按既有界面（角色列表 / 世界观编辑器 / 设置 / 相册）对照，新界面有 **6 处 P0、约 20 处 P1**。
- **超集**：**不是 PR #5 的超集**。数据层比 PR 干净（随库走、frontmatter、journal），但**能力层缺硬项**：关系图的 PNG 导出 / 边缘发散 / 正交曲线，小说的版面背景 / Docx 图片 / 导出对话框，地图的缩放平移 / 图层 / 多地图 / 成品导出 / 锚点创建，角色的「新建文件夹」「武器宠物写入路径」「动画播放与下载」。
- **且有 P0 级数据/交互 bug**：小说章节**正文读错字段且没有保存**（`DocumentEditor` 读 `document`，词条正文在 `content`，`onDocChange` 是空函数）；`NovelPreview` 与 `MediaContextMenu` 缺 `pointer-events-auto`（点不动、关不掉）；画廊右键菜单**从未渲染**；「新建文件夹」是死路。

---

## 1. 自动检查结果（审查时盘面）

| 检查 | 结果 | 备注 |
|---|---|---|
| `npx tsc --noEmit` | **0 错**（修 `tsconfig` 前会被 `out/` 里的 worker 源码绊倒） | `out/_next/static/media/worker.*.ts` 是构建产物，却被 `include: **/*.ts` 扫进类型检查；已在 `exclude` 里补 `out` / `src-tauri/target` |
| `npm run lint` | **28 error**（全部来自 `public/_cover-test/bundle.js`）+ 1946 warning | 该文件是封面实验留下的 1.2MB 打包产物，**会被静态导出一起发布**；删掉即 0 error。警告绝大多数是 `react-hooks` 新规则的存量代码。审查期间又出现 `public/_lab-test/`、`scripts/_lab-*.mjs`、`public/_lab-sketch.png` 等同类实验产物，合并前应统一清掉 |
| `npm run audit:design` | **0 违规** | 修完 EdgeStylePanel 后仍 0 |
| `npm run audit:theme` | 通过（29 令牌） | — |
| `next build`（隔离 worktree，webpack） | 通过 | 主工作区因封面 WIP 一度编译失败：`CoverArt.tsx` import 了 `lib/cover/color` 里不存在的 `seedTint` |

> **必须先清理**：`public/_cover-test/`、`public/_lab-cover.jpg`、`scripts/_cdp-*.mjs`、`scripts/cover-check.ts` 是审查/实验遗留；前两者会进公开产物，前者还会让 lint 失败。

---

## 2. 视觉一致性审查

### 2.1 逐界面对照（截图 → 问题）

| 界面 | 截图 | 与既有界面的偏差 |
|---|---|---|
| 角色列表（未提交的封面卡） | `51-characters-grid.png`、`90-mobile-home.png` | 卡片被换成 4:5 封面卡（WIP，另一个进程）；文件夹条选中态只换文字色、每夹一个 `⋯` 20px 热区、菜单不 Portal 且不关外、删夹无确认 |
| 小说书架 | `54-novel-shelf.png` | 页头不是 `TOOLBAR`（不粘顶、无 48px、无底边）；外层与内层双层滚动；移动端标题被固定顶栏压住 |
| 小说章节编辑器 | `61-novel-tree.png`、`92-dark-novel-tree.png` | 自建 `aside` + 页头，未用 `EntityEditorShell`；无文字页头 48px / 不粘顶 / 无历史按钮 / 无宽度拖拽 / 移动端无抽屉；选中行只换文字色；作品信息与封面挤成两列（简介被压成 100px 宽、出现滚动条） |
| 小说分页预览 | `62-novel-preview.png` | 用 `MENU`（6px）当大面板、非 `PANEL`（8px）；固定 `scale=0.55`，1440 下正文约 8.8px、页码约 6.6px；**根节点缺 `pointer-events-auto`，指针事件穿透** |
| 地图 | `55-map.png`、`93-dark-map.png` | 标题用 `SECTION_TITLE`（15px）而非 `PAGE_TITLE`（18px）；无 48px 工具栏；锚点是 `rounded-full` 胶囊 + `hover:scale-105`（全项目唯一一处 scale）；底部「拖动锚点即保存到实体的 map_position」把字段名写给用户；移动端可拖、且被顶栏压住 |
| 树表 | `56-tree-table.png`、`74-tree-country.png`、`77-tree-expanded.png` | 页签是自绘（无 1px 横贯底线、非 `ui/tabs`）；整行不可点（无 hover/光标/键盘）；无空态（只有「没有匹配」）；`px` 与列表页不一致 |
| 关系图 | `57-relations.png`、`73-edge-panel.png`、`95-dark-edge-panel.png` | 边样式面板 `fixed` 未 Portal、直接取点击坐标无翻转、容器加 `p-2`（违反「只 py-1」）、色板是 20px 方块且选中只改边框；改一项就关面板；移动端可拖可连（应只读）；图例方角无圆角；MiniMap 用裸 `rgba(0,0,0,.03)` |
| 设置 › 数据 | `66-settings-data.png`、`96-dark-settings-data.png` | 「从旧版本导入…」用 ASCII `...`，与旁边一致但都该用 `…`；动作按钮居中符合规范 |
| 设置 › 个性化 | `67-settings-general.png` | **「关系图鼠标模式」整组没有渲染**：`GeneralTab` 只 import 了 `MouseModeRadio`，JSX 里没有；`settings.mouseMode` 也没有参与任何 React Flow 属性 —— 提交 `5172543` 声称的 `panOnDrag / selectionOnDrag / selectionMode` 在 diff 里不存在 |
| 相册右键菜单 | `72-album-ctx.png` | 菜单能出现，但根层 `fixed inset-0` 缺 `pointer-events-auto`：**菜单项点不动、点外面关不掉**（实测 `pointer-events: none`） |
| 角色编辑 › 画廊右键 | `84-gallery-after-rc.png` | 右键后 `.fixed.inset-0.z-40` 层数为 **0**：`ImageGalleryGrid` 设了 `menuAt`、写了 `menuItems`、import 了 `MediaContextMenu`，但**从未渲染**，`preventDefault` 后什么都不弹 |
| 移动端 | `90-mobile-home.png` | 底栏只有 图鉴 / 世界观 / 时间线 / 关系图 / 相册；**小说 / 地图 / 树表 / 主页在手机上无入口**（侧栏 `max-md:hidden`，主页的入口也在桌面 Dashboard 里） |

### 2.2 问题清单（按严重度）

**P0（阻断 / 数据）**
1. 小说正文**不读 `content`、不保存**：`NovelTree` 用 `DocumentEditor`（读 `document`），`onDocChange={() => {}}`；切章直接丢稿。见 §3.1。
2. `NovelPreview` / `MediaContextMenu` 根节点缺 `pointer-events-auto` —— 浮层「看得见、点不着」。
3. `ImageGalleryGrid` 右键菜单是死代码。
4. 「新建文件夹」是死路（只把筛选切到一个不存在的名字；空夹在这个模型里不存在，`MoveToFolderMenu` 也不能新建）。
5. `public/_cover-test/bundle.js` 让 lint 28 error，并会随静态站发布。
6. 移动端到不了小说 / 地图 / 树表。

**P1（一致性与可达性）**
7. 小说编辑器未用 `EntityEditorShell`：页头 / 列表面板 / 移动抽屉 / 历史按钮 / 宽度拖拽全部缺位。
8. 地图页标题档位错、无 48px 工具栏、锚点胶囊 + scale、底部泄露字段名。
9. 树表页签自绘、行不可点、无空态。
10. 关系图边面板未 Portal、无翻转、`p-2`、方块色板、改一项即关。
11. 关系图移动端可拖可连；图例无圆角；MiniMap 裸 rgba。
12. 文件夹条：chip 选中只换文字色（应用 `CHIP_ON`）、`⋯` 20px、菜单不 Portal/不关外、危险项无 `text-error`、图标语义错（`Check` 当重命名、`X` 当删除）、删夹无确认、不碰 `updatedAt`。
13. 媒体右键菜单与既有 `ContextMenu` 是两套实现（后者有贴边翻转、淡入、`pointerdown` 关外）；新媒体菜单以上全无。
14. 相册缩略图无 `rounded-item`；hover「跳转」与菜单「跳转」重复；相册动作表缺「查看」且顺序与桌面相反。
15. 小说预览固定 0.55 缩放、`MENU` 当面板；导出走 `<a download>`（桌面不可靠）、文件名未净化。
16. 数据页旧版导入入口只在小说空态出现；导入结果提示在非空态不可见；无 try/finally。
17. 设置单选框尺寸/颜色被改成 `h-3.5` + `bg-ink`（文档写 `h-4` + `bg-ink-muted`），实现与文档只有一边对。

**P2**
18. 图上圆钮四套皮肤（`black/40`、`black/30`、`scrim`、尺寸三档）。
19. `ImageUploader` 的菜单 `fixed` 未 Portal、`onMouseLeave` 即关。
20. 时间线页标题也是 15px（存量问题，与 skill 的「时间线用 PAGE_TITLE」不符）。
21. `ImageGalleryGrid` 删除按钮 24px；相册卡无 onError 兜底（测试图裂了会露 alt）。

### 2.3 设计规范本身不够用的地方（建议新增通用件）

- **`OVERLAY_ROUND_BTN`**：压在图上的圆钮（删除 / 移动 / 拖拽 / 上传菜单）现在四套皮肤。收进 `ui-tokens`，统一 `bg-[var(--oc-scrim)] text-paper-fixed`、`h-6 w-6`（移动 44px 命中）。
- **`useDismissableLayer`**：文件夹菜单、移动菜单、边面板各写一遍「外点 + Esc」；且现在多数没写。抽 hook（`pointerdown` 捕获 + Escape），和 `ContextMenu` 共用。
- **`MenuPortal`**：所有「按点击坐标弹的菜单」统一 Portal + `adjustContextMenuPosition`（现在 `MediaContextMenu` 修好了，`MoveToFolderMenu` / `EdgeStylePanel` 各写一份）。
- **`TextInputInline`**：文件夹重命名 / 新建用了 `INPUT_LINE`（`w-full`），在 `flex-wrap` 里会把整行撑开；需要 `w-28` 的行内输入原子。
- **`PagePanelHeader`**（`TOOLBAR` 的 React 封装）：小说书架、地图、树表各写一遍 48px 页头；抽成 `<PageToolbar title actions>`，避免再次出现 15px/18px 分叉。
- **`ListEmptyState`**：三张列表 + 树表 + 小说各写一套；统一 `EMPTY_HINT` + 一句事实，支持「清除筛选」动作。

---

## 3. PR #5 超集审查（能力矩阵）

> 判定口径：**≥ PR 且至少一处增强**；`⛔` 表示必须作者明确同意才可放弃。

### 3.1 小说（#24–#28）—— 4 项未达标

| # | PR 行为 | 我们的落点 | 判定 | 差距 |
|---|---|---|---|---|
| 24 | 自建编辑器 + `novelDb`，章节可改名/删/排序/状态/字数 | `NovelTree.tsx` + `DocumentEditor` | **❌ 不可用** | **正文读错字段且不保存**（P0）；书名/章名不可改（`renameNovelEntry` 零调用）；章节不可删/排/嵌套；无状态、无 dirty |
| 25 | `render.ts` + `background.ts`：9:16/16:9/A4、清晰度、版面背景、封面页、图片块 | `pagination.ts` + `NovelPreview` | ⚠️ | `background.ts` 未搬；无清晰度/背景上传/PNG 页导出；预览不可操作（pointer-events）、固定 0.55 |
| 26 | Docx（封面/作者/简介/分页/图片内联）+ 逐页 PNG | `export.ts` + `docx.ts` | ⚠️ | 无图、无封面/作者/简介/分页；TXT/Docx/预览混入 Markdown 标记（`flattenNovel` 恒 markdown）；MD 丢图/内链；标题层级冲突；文件名未净化；桌面走 `<a download>` |
| 27 | 不行（第二个 IDB） | 章节进 `worldEntries`、`.ocbak` 含行 | ⚠️ | `[[章节]]` 点击后世界观列表已过滤小说 → 死链；`novelCover` 未进 `image-refs` → 备份/落地漏封面 |
| 28 | 字数进状态栏 + 目标进度 | `countNovelWords` + `useWordCount` | ⚠️ | 小说分区没写 `WordCountContext`（状态栏恒 0）；字数把 `**`/`#` 算进去；正文不保存导致不更新 |

**额外**：PR 的 `NovelExportDialog`（尺寸 / 清晰度 / 背景 / PNG 页）与 `background.ts` 能力**整体缺失**。

### 3.2 关系图（#1–#13）—— 5 ✅ / 4 ⚠️ / 4 ❌

| # | 能力 | 判定 | 证据 / 差距 |
|---|---|---|---|
| 1 | 同对多条关系线 | ✅（修后） | 创建不再按「这一对已存在」拒绝，只拒绝**同名**；边 id 带关系名（`pairKey::relation`）。反向查询仍未做（B 的关系表看不到 A 发起的边） |
| 2 | 每条边的名字 | ⚠️ | 有 label，不可改；反向查不到（B 的关系表为空） |
| 3 | 12 色文字同色 | ✅ | 令牌 + 落盘 + 渲染齐 |
| 4 | 箭头四档 | ✅ | 新角色关系默认 `both`（修后） |
| 5 | 曲线边 / 正交可切换 | ⚠️ | 只有固定贝塞尔；无 `edgeStyle`、无工具栏切换 |
| 6 | 框选 + 鼠标模式 | ✅（修后） | `panOnDrag` / `selectionOnDrag` / `SelectionMode.Partial` / `selectionKeyCode` 已接；设置项已渲染；移动端只读 |
| 7 | 自动整理 | ✅ | 力导向 + 落盘，比 PR 强；但切筛选会回弹 |
| 8 | 拖动保存 | ✅ | 落 `graph_position` |
| 9 | 手动保存布局 | ⚠️ | 无按钮（自动保存已覆盖数据） |
| 10 | 删节点清理投影 | ✅（修后） | `purge{Character,Country,Event}References` 清关系表 / 国家名单 / 事件参与者，不碰 `updatedAt` |
| 11 | 关系图 PNG | ❌ | 无 `exportGraph.ts`、无按钮、未接保存对话框 |
| 12 | 节点侧「+」手柄 | ✅ | 四向 `NODE_HANDLE`；移动端已禁连（修后） |
| 13 | 从头像边缘发散 | ❌ | 固定从四个手柄贝塞尔，没有边缘求交；也没隐藏连接圆点 |

### 3.3 地图（#19–#23）—— 视图层是子集

算法层与 PR 逐字节同源（真超集），数据层更好（随库走），但**视图层缺**：缩放平移、图层开关、多地图管理、底图+锚点成品导出、剖面图、图例、标注；锚点只有「移动」，**没有创建入口**（新库永远是 0 锚点）；`MapGeneratorPanel` 的「PNG」既把孤儿 PNG 塞进素材目录、又用 `<a download>`（WebView2 不弹），且切视图会重建 Worker 导致画布与生成结果错位、`map_params` 记录的是 UI 原始参数而不是生效参数。

### 3.4 角色 / 媒体（#14–#18）—— 3 项未达标

| # | 能力 | 判定 | 差距 |
|---|---|---|---|
| 14 | 文件夹四动作 | ❌ | 「新建」死路；移动端无入口；删夹无确认；改名撞名静默合并；操作污染 `updatedAt` |
| 15 | 字段可增删 | ✅（模型不同） | 全局字段表随库走；不能只给单个角色加一行 |
| 16 | 照片上传/下载 | ⚠️ | 桌面强于 PR；移动端编辑器里点不到（hover 才现形）；Capacitor 静默失败；无防连点；大文件走 JSON `number[]` IPC |
| 17 | OC 动画 | ⚠️ | 只能看 48×80 静音首帧、点不开、不能下载；浏览器把 `blob:` 写进数据；`.ocbak` 不含视频 |
| 18 | 武器/宠物 | ❌ | **全项目没有任何地方写 `kind`**（`CharacterFormData` 无此字段、`updateCharacter` 白名单无 kind）→ 两个筛选项恒为空；手写中文 `类别: 武器` 会被原样 cast，既筛不到、在「角色」里还会消失 |

---

## 4. 正确性 bug（P0 / P1）

### 4.1 小说（P0）

- **正文读错字段 + 不保存**：`NovelTree.tsx:224` 用 `DocumentEditor`（`useDocument` 只读 `document`），词条正文在 `content`；`onDocChange={() => {}}` 是空函数。复现：新建章 → 输入 → 切章 → 文字消失。修复方向：改用 `WorldEntryBody` + `useWorldEntryDraft`（已在 `review/pr5-ui` 完成）。
- **切章不 flush**：`key={selected.id}` 重挂编辑器，A 章未落库即丢。
- **预览 pointer-events**：根层缺 `pointer-events-auto`，X/尺寸/滚动全部失效。
- **导出文本混入 Markdown**：`collect()` 恒 `chapterText(..., true)` → TXT/Word/预览出现 `**` `##`；字数把标记算进去。
- **标题层级冲突**：书名 `#`、第一章也是 `#`。
- **图片/引用/内链丢失**：`blockLines` 无 `imageBlock` 分支；`inlineText` 对 mention/wikiLink 只拼 `content`（空）。

### 4.2 数据一致性（P1）

- 删角色不清投影（关系表 / 国家名单 / 事件参与者）。
- 同对角色第二条关系：UI 与服务双拒；绕过则边 id 冲突。
- 边只写发起方，B 编辑器查不到；改样式只改 source。
- 拖动/整理后切筛选回弹（pinned 取 `rawNodes`）。
- Backspace 删除只删本地状态（无 `deleteKeyCode={null}`）。
- 文件夹操作写 `updatedAt` → 「最近更新」被分组操作刷屏；比较前不 trim，手写带空格的名删不掉。
- 地图拖动每个 pointermove 都写库 + 写日志；空 `map_id` 的锚点会出现在所有地图。

---

## 5. 已在隔离分支修复的部分（`../oc-review` @ `review/pr5-ui`）

> 只改 HEAD 上已提交的文件；**不碰**主工作区里另一个进程正在改的封面 / 列表卡文件。验证：`tsc` 0 错、`audit:design` 0 违规、`next build` 通过、重跑截图。

| # | 修复 | 文件 |
|---|---|---|
| 1 | 媒体右键菜单：`pointer-events-auto` + 贴边翻转 + `pointerdown` 关外 + Esc + 危险项 `hover:bg-error-light` | `components/shared/MediaContextMenu.tsx` |
| 2 | 画廊网格渲染右键菜单（查看 / 保存到… / 移除），清掉 3 条 unused warning | `image-gallery/ImageGalleryGrid.tsx` |
| 3 | 边样式面板：Portal 到 `#overlay-root`、夹进视口、去 `p-2`、圆形色点 + 选中边框、箭头行加选中底与勾、**改一项不再关面板**、Esc/点外关闭 | `relations/components/EdgeStylePanel.tsx` |
| 4 | 关系图：接 `panOnDrag` / `selectionOnDrag` / `selectionMode=Partial` / `selectionKeyCode`；移动端禁拖禁连禁框选；`deleteKeyCode={null}`；点画布关面板；角色↔角色/事件↔事件允许多条不同名关系；边 id 带关系名；新角色关系默认双向；hover 淡出接到自定义边上 | `RelationGraph.tsx`、`services.ts`、`RelationEdge.tsx` |
| 5 | 删角色/国家/事件时清理投影（不碰 `updatedAt`） | `lib/membership.ts` + 三个 `delete*` |
| 6 | 设置 › 个性化真正渲染「关系图鼠标」 | `settings/tabs/GeneralTab.tsx` |
| 7 | 小说编辑器改用 `EntityEditorShell` + `WorldEntryBody` + `useWorldEntryDraft`：正文读写 `content`、2s 防抖落库、切章/返回 flush、书名与章名可改、章节可删、字数进状态栏、移动端抽屉、章节目录（搜索 / 选中底 / 48px 页头） | `novel/NovelTree.tsx` |
| 8 | 小说书架 48px 粘顶页头、移动端 spacer、错误/加载态、导入结果 toast、后台刷新、旧库入口常驻 | `novel/NovelSection.tsx` |
| 9 | 分页预览：`pointer-events-auto`、`PANEL` + 8px、响应式缩放、页码移出缩放层、48px 页头 | `novel/NovelPreview.tsx` |
| 10 | 导出：默认纯文本（TXT/Word/预览/字数），Markdown 显式开关；标题层级 +1；图片/引用/内链可读；文件名净化 | `novel/export.ts` |
| 11 | 地图：18px 标题 + 48px 工具栏、移动端只读 + spacer、锚点去胶囊去 scale、删掉字段名文案、加载态 | `map/MapView.tsx` |
| 12 | 树表：改用 `ui/tabs`（等分 + 2px 下划线 + 1px 底线）、整行可点进编辑器（键盘可操作）、筛选空态可点清除、四类一起刷新、移动端横滚 | `tree-table/TreeTable.tsx`、`app/page.tsx` |
| 13 | 文件夹条：选中用 `CHIP_ON`、`⋯` 用 `ICON_BTN`、菜单 Portal + 关外 + 危险色 + `Pencil/Trash2`、删夹二次确认、删掉死路「新建」 | `CharacterFolderBar.tsx`、`CharacterList.tsx` |
| 14 | 「移到文件夹」：Portal + 夹进视口 + 关外 + Esc；新增「新建文件夹…」（输入名字即把该角色移进去，真实可用）；无 current 时不显示「移出」 | `MoveToFolderMenu.tsx` |
| 15 | 文件夹数据：移动/改名/删除不再写 `updatedAt`，比较前 trim | `folders.ts` |
| 16 | 移动端「更多」：底栏之外的 主页 / 小说 / 地图 / 树表 收进 `MobileActionSheet`；`MobileSection` 扩到 `novel/map/tree/home`（此前手机推导的 `activeItem` 只认五个 section，设 `activeItem` 无效）；小说编辑器加 60px 顶栏 spacer、书架补移动端「新建小说」 | `MobileTopBar.tsx`、`MobileNavigationContext.tsx`、`use-entity-workspace.ts`、`NovelTree.tsx`、`NovelSection.tsx` |
| 17 | 修 `tsconfig`：`exclude` 补 `out` / `src-tauri/target`（`out/` 里的 worker 源码会让全项目 `tsc` 报 20+ 条「找不到模块」） | `tsconfig.json`（主工作区直接修复，未进隔离分支） |

**这些修复不包含**（需要更多设计/数据决策，见 §6）：多条关系的创建 UI、PNG 导出、边缘发散、正交/曲线切换、地图缩放/图层/多地图/成品导出、地图生成器的 Worker 与导出 bug、`kind` 写入路径、动画播放/下载、字段可增删的单实体版本、`.ocbak` 补动画与小说封面。

### 5.1 修复后的复核（截图见 `logs/review/shots/A*`、`B*`）

- `tsc --noEmit`：0 错；`audit:design`：0 违规；`next build`（webpack）：通过。
- 小说正文：写入「测试保存是否生效」→ 切到第二章再切回 → 内容仍在；整页 reload 后仍在（`A8-novel-save-check.png`）。此前切章即丢。
- 章节编辑器：顶栏 / 列表面板 / 搜索 / 选中底 / 作品信息 / 状态栏字数（102）与世界观编辑器同构（`A1-novel-tree-fixed.png`）。
- 地图：48px 工具栏 + 18px 标题，锚点为小圆角标签、无 scale，底部字段名文案已删（`A2-map-fixed.png`）。
- 树表：等分页签 + 2px 下划线 + 横贯底线，整行可点（`A3-tree-fixed.png`）。
- 关系图面板：圆形色点、箭头选中勾、改一项保持打开（`A4/A5-edge-panel-fixed.png`）；离开分区自动收起。
- 文件夹菜单：Portal、危险项红字、点外部关闭（`A6-folder-menu-fixed.png`）。
- 设置：个性化出现「关系图鼠标」两项（`A7-settings-mouse-fixed.png`）。
- 手机：顶栏「更多」→ 主页 / 小说 / 地图 / 树表；小说书架与章节编辑器不再被 60px 顶栏压住（`B1`–`B4`）。

> 分支：`../oc-review` @ `review/pr5-ui`（提交 `307f708`）。合并到主工作区时需要手工解 3 个文件的重叠：`CharacterList.tsx` / `MoveToFolderMenu.tsx`（未提交的封面卡与 `tone="overlay"`）、`MapView.tsx`（未提交的地图生成器面板）。

---

## 6. 建议的落地顺序

1. **止血**：删 `public/_cover-test/` 与 `_lab-cover.jpg`；`NovelTree` 接 `content` 管线；两个浮层补 `pointer-events-auto`；画廊菜单补渲染；移动端入口。
2. **能力对齐（PR 超集）**：关系图 #1（多条边创建、唯一 id、反向查询）、#10（已修）、#11（PNG 导出走保存对话框）、#13（边缘求交）；地图锚点创建 / 删除 / 跳转 + 缩放平移 + 图层；小说 `background.ts` / 清晰度 / PNG 页；角色 `kind` 写入 + 读入归一、动画播放/下载。
3. **视觉收口**：小说/地图/树表统一 `PageToolbar`；关系图面板与图例/小地图令牌化；相册圆角与入口去重；文件夹条与移动菜单统一用 `useDismissableLayer`；`OVERLAY_ROUND_BTN` 统一图上圆钮。
4. **文档同步**：`docs/关系图.md` §2.1（色点选中改为 1px 边框，与 audit 对齐）、`docs/小说.md`（正文管线是 `content`）、`docs/todo.md` 把「鼠标模式已实现」改成实际状态；`AGENTS.md` 增加「浮层根节点必须 `pointer-events-auto`」与「空文件夹不存在，新建入口在移动菜单」。

---

## 7. 复现与验证

```bash
# 隔离审查环境（不动主工作区）
git worktree add ../oc-review HEAD
cmd /c mklink /J "..\oc-review\node_modules" "node_modules"   # Turbopack 不接受指向 root 外的 junction，改用 webpack
cd ../oc-review && npx next dev -p 3200 --webpack
# 或静态导出 + 任意静态服务器
npx next build --webpack && node ../OC-Studio/logs/review/static-server.mjs out 3301
```

- 截图驱动：`logs/review/cdp.mjs`（CDP 9334，headless Edge）+ `logs/review/seed.js`（可复现示例数据）。
- 修复分支：`../oc-review`，`git checkout review/pr5-ui`；合并：`git -C ../OC-Studio diff main review/pr5-ui` 或按文件 cherry-pick。
- 注意：审查期间主工作区有另一个进程在改封面卡（`src/lib/cover`、`components/shared/cover`、`AGENTS.md`），所以修复全部落在隔离 worktree，避免互相覆盖。
