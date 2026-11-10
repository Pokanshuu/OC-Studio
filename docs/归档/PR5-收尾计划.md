# PR #5 收尾计划（执行用）

> **已归档 2026-11-10** —— Wave 0–3 全部交付（2026-11-04 收尾完成），文件边界与独占约定已失效。
> 当时的能力缺口后来逐条补齐：关系图 PNG 导出 / 边缘发散 / 正交与曲线、地图缩放平移与图层与多地图与成品导出、
> 小说版面背景与 Docx 与导出对话框、动画播放与下载。
> 唯一没按原计划做的是 D3「`kind` 写入路径」—— 它被「自定义分类 = 模板 + 一组笔记」取代，`kind` 字段已整体删除。

> 2026-11-03。基线：`feat/intake-pr5` 工作区（含封面卡 WIP）。审查见 `docs/归档/审查-PR5分支-视觉与超集.md`；上一轮 P0/P1 修复已在工作区（`review/pr5-ui` 分支 + 手工合并）。
> 本文是**执行清单**：每项写清文件边界、验收与不可动项。子代理只做自己那一格，**不许 `git` 写操作**（当前工作区有未提交的封面卡改动）。

## 0. 原则

1. **一个实现只能有一个源**：重复的就合并（右键菜单、菜单面板、图上圆钮、页头、空态）。
2. **新界面必须穿过设计系统**：`ui-tokens` 取类名；圆角三档；零描边；浮层 Portal 到 `#overlay-root` 且根节点 `pointer-events-auto`；只有一档阴影。
3. **数据层不新造真源**：frontmatter / `worldEntries` / 现有表；不建第二套 localStorage 层级。
4. **能力 ≥ PR #5**，且每项至少一处增强（随库、可内链、移动端可用、可撤销、与导出共用渲染）。
5. **移动端不作为本轮验收门槛**（用户明确），但不要主动弄坏；桌面三态（空 / 满 / 只读）必须有。
6. 不新增 npm 依赖（docx/zip/canvas 都用现有的）；不恢复 AI；不碰 `src/lib/ai`。

## 1. 波次与文件边界

### Wave 0 —— 共享原语（先做，后面全部复用）

| ID | 任务 | 文件 | 验收 |
|---|---|---|---|
| S1 | `useDismissableLayer`：`pointerdown` 捕获关外 + Escape，返回 `ref`；用于所有点击坐标浮层 | 新建 `src/lib/use-dismissable-layer.ts` | 三个浮层改用它，删除各自重复的 effect |
| S2 | `MenuSurface`：`createPortal` 到 `#overlay-root`、`pointer-events-none` 根 + `pointer-events-auto` 面板、贴边翻转（`adjustContextMenuPosition`）、`MENU` 容器、可选 `width` / `role` | 新建 `src/components/shared/menu/MenuSurface.tsx` | `MediaContextMenu` / `EdgeStylePanel` / `MoveToFolderMenu` / `CharacterFolderBar` 全部改用它 |
| S3 | `OVERLAY_ROUND_BTN` 令牌 + `OverlayIconButton`（图上圆钮唯一皮肤；移动 44px 命中） | `src/lib/ui-tokens.ts` + 新建 `src/components/shared/OverlayIconButton.tsx` | `DeleteButton(tone=overlay)` / `MoveToFolderMenu(tone=overlay)` / `DragHandle(overlay)` / 画廊删除钮 / `ImageUploader` 的 ⋯ 共用 |
| S4 | `PageToolbar`：48px 页头（标题 + 动作区），桌面粘顶、移动端不粘顶 | 新建 `src/components/shared/PageToolbar.tsx` | 小说书架 / 地图 / 树表 / 相册页头改用它；标题档位统一 `PAGE_TITLE` |
| S5 | `ListEmptyState`：一句话 + 可选动作（清除筛选 / 新建），`EMPTY_HINT` | 新建 `src/components/shared/ListEmptyState.tsx` | 角色 / 事件 / 国家 / 树表 / 小说 / 相册空态复用 |
| S6 | 行内输入原子 `INLINE_INPUT`（固定宽度，不用 `INPUT_LINE` 的 `w-full`） | `ui-tokens.ts` | 文件夹重命名 / 新建输入框使用 |

**S 波独占**：`src/lib/ui-tokens.ts`、`src/components/shared/menu/**`、`src/components/shared/OverlayIconButton.tsx`、`PageToolbar.tsx`、`ListEmptyState.tsx`、`use-dismissable-layer.ts`、`MediaContextMenu.tsx`、`EdgeStylePanel.tsx`、`MoveToFolderMenu.tsx`、`CharacterFolderBar.tsx`、`DeleteButton.tsx`、`ImageUploader.tsx`、`list-dnd.tsx`、`ImageGalleryGrid.tsx`。其它波不得改这些文件。

### Wave 1 —— 数据/能力底层（与 S 并行，文件互斥）

| ID | 任务 | 文件 | 验收 |
|---|---|---|---|
| D1 | 图片引用收集补齐：`animationUrl`（角色动画）、`novelCover`（小说封面）、`mapImage`（地图底图） | `src/lib/image-refs.ts`、`src/lib/export/payload.ts`、`src/lib/vault/export-dir.ts` | `.ocbak` 换库后三类文件都在；`vault-migrate-check` 增加断言 |
| D2 | 媒体「保存到…」三环境分支（Tauri 对话框 / Capacitor Filesystem+Share / 浏览器下载）+ 返回 null 要 toast + pending 防连点 | `src/lib/media-download.ts`、`src/lib/video-upload.ts` | 三个调用点（相册 / 画廊 / 上传器）失败可见、双击不出两个对话框 |
| D3 | 武器/宠物写路径：`kind` 进表单 / 创建 / 更新白名单；`scan` 把 `武器/宠物/角色`、`weapon/pet/character` 归一，非法值回落 `character`；编辑器加「类别」选择 | `features/characters/types.ts`、`services.ts`、`hooks/useCharacterForm.ts`、`components/CharacterInfoSection.tsx`、`lib/vault/scan.ts` | 新建可选类别；筛「武器」能出数据；手写中文 `类别` 不再让角色消失 |
| D4 | 地图底图落 `.ocstudio/maps/`：生成 / 上传走 `vault_list_assets` 枚举，不再进 `附件/` | `features/map/services.ts`、`src-tauri/src/vault.rs`（如需新命令先说明）、`lib/image-service.ts` | 换机后 `map_image` 仍可解析；`docs/地图.md` 口径一致 |

### Wave 2 —— 四个领域的能力补齐（D 波完成后并行）

| ID | 任务 | 文件 | 验收 |
|---|---|---|---|
| R1 | 关系图 PNG：重绘（节点 / 边 / 标签）→ 系统保存对话框 + `save_bytes`；失败 toast | 新建 `features/relations/export-graph.ts`、`RelationGraph.tsx`、`lib/download.ts` | 桌面能选路径保存；浏览器退回下载 |
| R2 | 边型切换：设置 `edgeStyle: 'orthogonal' \| 'curve'`（默认 orthogonal）+ 工具栏切换 + 正交路由；曲线沿用现有贝塞尔 | `lib/settings.tsx`、`features/relations/components/relation-graph-utils.ts`、`RelationEdge.tsx`、`MobileRelationControls.tsx`、`RelationGraph.tsx`、`components/settings/tabs/GeneralTab.tsx` | 切换即时生效且刷新后保持 |
| R3 | 从节点边缘发散：圆（角色）/ 矩形（事件 / 国家）求交，隐藏连接圆点（曲线模式）；正交模式用四向落点 | `relation-graph-utils.ts`、`RelationEdge.tsx`、`ui-tokens.ts`（不改，引用即可） | 线贴着头像边缘，不悬空 12–28px |
| R4 | 手动保存布局按钮 + 整理可撤销（会话内 undo toast） | `RelationGraph.tsx`、`MobileRelationControls.tsx` | 按钮给确认 toast；整理后可撤销一次 |
| N1 | 版面背景：`background.ts`（纸色 / 纹理 / 自定义图）接入预览与 PNG 导出 | 新建 `features/novel/background.ts`、`NovelPreview.tsx` | 预览可见背景；背景随预览切换 |
| N2 | 导出对话框：尺寸 / 清晰度 / 背景 / 逐页 PNG + Docx 选项（封面、作者、简介、分页、图片内联） | 新建 `features/novel/NovelExportDialog.tsx`、`docx.ts`、`NovelTree.tsx` | 三个格式都从对话框出；Docx 有封面/作者/分页/图片 |
| N3 | 字数与内链：小说字数写 `WordCountContext`；`[[章节]]` 点击跳小说并定位 | `NovelTree.tsx`、`lib/use-entity-workspace.ts`、`features/world/components/world-content-utils.ts`（如需） | 状态栏显示全书字数；章节内链不再落到空世界观 |
| N4 | 章节结构：新建子章 / 上下移 / 删除确认；目录拖拽可选 | `NovelTree.tsx`、`features/novel/services.ts` | 能构造 `parentId` 两层树 |
| M1 | 锚点全生命周期：新建（从国家 / 事件 / 词条列表选）、删除、点击跳实体；图层开关（国家 / 事件 / 词条） | `features/map/MapView.tsx`、新建 `features/map/components/*`、`services.ts` | 新库能创建锚点；点锚点进编辑器 |
| M2 | 缩放 / 平移（沿用关系图手势），锚点按缩放变换 | `MapView.tsx`、新建 `useMapViewport` | 滚轮缩放、拖拽平移、复位 |
| M3 | 多地图管理：重命名 / 删除 / 切换；底图 + 锚点成品 PNG 导出（保存对话框） | `MapView.tsx`、`MapManager`、`features/map/export.ts` | 至少两张图；导出含锚点 |
| M4 | 生成器修 bug：单 Worker、requestId 过滤、参数 normalize 后回传、onerror、导出走保存对话框、去掉双写 | `features/map/MapGeneratorPanel.tsx`、`plugins/map-generator/worker.ts`、`kernel/index.ts` | 切视图不丢世界；`map_params` 与像素一致；导出不产生孤儿文件 |
| C1 | 动画：可播放（全屏 / controls）、可保存、`blob:` 不入库、上传防连点 | `CharacterInfoSection.tsx`、`features/characters/components/*`、`video-upload.ts` | 传完能看能下；刷新后没有 `blob:` |
| C2 | 相册：缩略图圆角、去掉 hover 重复「跳转」、动作表顺序与桌面一致、`onError` 兜底 | `AlbumCard.tsx`、`GlobalAlbum.tsx` | 与画廊观感一致 |
| C3 | 移动端「移到文件夹」进动作表；文件夹操作后保留当前筛选 | `CharacterList.tsx`、`CharacterListItems.tsx` | 手机长按能看到并执行 |

### Wave 3 —— 合并 / 清理 / 验证

| ID | 任务 |
|---|---|
| X1 | 删除实验产物：`public/_cover-test/`、`public/_lab-*`、`scripts/_lab-*`、`scripts/_cdp-*`；保留 `scripts/cover-check.ts`（AGENTS 已登记） |
| X2 | `npm run lint` 0 error；清理本轮引入的 unused；不要动存量的 `react-hooks` warning 大扫除 |
| X3 | `npx tsc --noEmit` / `npm run audit:design` / `npm run audit:theme` / `npm run build` 全绿 |
| X4 | Vault 自检：`vault-migrate-check` / `journal-check` / `frontmatter-check` / `write-acceptance`（有真实 vault 才跑） |
| X5 | 文档同步：`docs/todo.md`（勾掉完成项）、`docs/关系图.md`（边型 / 发散 / 导出）、`docs/小说.md`（导出对话框 / 背景）、`docs/地图.md`（锚点创建 / 缩放 / 多地图）、`AGENTS.md`（新原语与约定） |
| X6 | 截图复核：小说编辑 / 导出对话框 / 关系图三档边型 / 地图缩放与图层 / 相册 / 空态 |

## 2. 禁止事项

- 不 `git add/commit/stash/checkout`（封面卡 WIP 在盘上，误操作会丢）。
- 不修改 `src/lib/cover/**`、`src/components/shared/cover/**`、`src/app/providers.tsx`、`src/components/layout/AppShell.tsx`、`MenuBarMenus.tsx`（封面卡那条线）。
- 不改 `docs/PR5-拆解清单.md`（gitignore、临时）。
- 不新增依赖、不引入第二套状态管理、不碰 AI。

## 3. 每项交付格式

子代理回传：改了哪些文件（路径:行）、验收命令结果、遗留问题。不要贴大段代码。
