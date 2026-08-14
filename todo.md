# TODO — OC Studio 待办与改进清单

> 本文件记录产品改进建议与后续重构计划。按「交互设计建议」「技术重构」「已知技术债」三块维护，优先级 P0 > P1 > P2 > P3。

---

## 一、界面交互设计建议（为需求服务）

> 已在 `stability-update` 分支实现的标 [x]；用户确认跳过的标 ~~删除线~~；待用户拍板的标 [ ]。

### 已完成（stability-update）
- [x] **未保存更改保护**：`beforeunload` 防刷新/关标签 + 返回键与同类型跨实体跳转弹确认。
- [x] **保存状态可见**：StatusBar 显示「未保存 / 保存中 / 已保存」。
- [x] **保存快捷键去 hack**：`Ctrl/Cmd+S` 改为 `requestSave()` 显式命令。
- [x] **命令面板（Ctrl/Cmd+K）**：快速新建（角色/事件/国家）+ 切换板块（7 个板块）；实体搜索跳转原本已有。
- [x] **词条编辑体验统一**：删除死代码 WorldEditor（HTML 路径），World 内容统一为 TipTap JSON。
- [x] **关系图增强**：悬停聚焦高亮邻居 + 图例；类型筛选/节点头像/双指缩放原本已有。
- [x] **相册素材库（部分）**：类型过滤（已有）+ 标签过滤 + 按更新时间排序。
- [x] **完整备份（含图片）**：图片内联为 data URI，换机可移植；「不含图片」提示已有。
- [x] **空状态引导**：全站已有（角色/事件/国家/词条/图谱/时间线/相册），无需改。

### 已跳过（用户确认不做）
- ~~编辑/浏览模式落地~~（交互未定，搁置）
- ~~时间线移动端可编辑~~（点击时间已进编辑，且移动端交互不便）
- ~~标签交互~~（没必要）
- ~~快捷键可发现性提示~~（没必要）

### 待定（需用户拍板交互）
- [ ] **相册批量操作**：需明确语义（批量删除 / 批量移动到画廊 / 批量下载？）。
- [ ] **命令面板合并移动端搜索**：MenuBar 搜索与 MobileSearchOverlay 合并为统一组件。

### 其他打磨（P3）
- [ ] 移动端断点缺口（640–768px：菜单 `hidden sm:flex` 与侧栏 `max-md:hidden` 不一致）。
- [ ] 移动端选词栏滚动跟随非首段（`MobileTextSelectionBar` 只取第一个 `.section-fade`）。

---

## 二、技术重构（独立 PR，风险较高）

### P2 — 数据层
- [ ] **统一到 React Query**：characters / events / world 仍是手写 `useState + refreshKey + data-updated` 事件；countries 已用 React Query。统一后删除事件总线与 `refreshKey`。
- [ ] **泛型 CRUD 仓储**：消除 characters / events / countries / world 4 份 services + 5 份 hooks 的复制。
- [ ] **World `content` 单格式迁移**：HTML 路径已删（WorldEditor），现为 JSON 字符串（active）+ `document` 对象（unused）两形态，可进一步收敛到 `document`。

### P2 — 组件拆分（God 组件）
- [ ] `src/features/timeline/components/TimelineView.tsx`（1353 行）
- [ ] `src/components/editor/EditorCore.tsx`（~1000 行，含 DOM 手搓弹层 ×3）
- [ ] `src/app/page.tsx`（570 行，视图路由/返回栈/滑动动画抽 hook）

### P3 — 死代码清理
- [ ] `saveDocument` ×4（characters/events/countries/world）
- [ ] `sync.ts` 的 `markAsPending` / `markAsSynced` / `getPendingItems`（同步 stub）
- [x] `WorldEditor.tsx`（已删除）
- [ ] `EditorToolbar.tsx`、`AlbumTriggerContext.tsx`（零引用）
- [ ] `Character.relationships` 字段（实际用 `relatedCharacters`）
- [ ] `db.ts` v3→v4 无操作迁移
- [ ] `adapter.getUrl()`（local-adapter / capacitor-adapter）
- [ ] 未接线的 AI `buildEntityContext` / `buildProjectContext`

### P3 — 一致性
- [ ] 环境检测抽 `lib/env.ts`（`isTauri` / `isCapacitor` 5+ 处不一致副本）
- [ ] 版本号单源（package.json / SettingsDialog 硬编码 / AGENTS.md 三处漂移）
- [ ] 浮层 Portal 统一到 `#overlay-root`（`dialog.tsx` / `alert-dialog.tsx` / `FullscreenViewer` / `ImageCropper` / 三处编辑器弹层）
- [ ] `id?: number` → 精确类型，去掉系统性 `as number` / `as never`

---

## 三、已知技术债（继承自 AGENTS.md）
- [ ] 桌面/移动端折叠展开图标规则同步到 RelationGraph 的 Controls（当前用 @xyflow/react 默认图标）
- [ ] `_syncStatus` 写入逻辑各 service 手写，应统一
