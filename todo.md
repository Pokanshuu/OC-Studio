# TODO — OC Studio 待办与改进清单

> 本文件记录产品改进建议与后续重构计划。按「交互设计建议」「技术重构」「已知技术债」三块维护，优先级 P0 > P1 > P2 > P3。

---

## 一、界面交互设计建议（为需求服务）

### P1 — 创作效率与数据安全感（优先做）
- [ ] **未保存更改保护**：离开编辑器 / 切换板块时若有未保存改动，弹提示或自动存草稿；当前可能静默丢字。
- [ ] **保存状态可见**：StatusBar 显示「未保存 / 保存中 / 已保存」。
- [ ] **保存快捷键去 hack**：`Ctrl+S` 从 `document.querySelector('[data-save-button]')` 改为显式保存命令/事件。
- [ ] **命令面板（Ctrl/Cmd+K）**：统一全局跳转（任意角色/事件/国家/词条）、快速新建、切换板块；合并 MenuBar 搜索与移动端搜索。
- [ ] **编辑/浏览模式落地**：当前「浏览模式」是死开关——实现真正的只读锁（防误触 + 明显「编辑」入口），或移除菜单项。
- [ ] **词条编辑体验统一**：World `content` 统一为 TipTap JSON，让词条也能用 `@` 提及与 `[[` 内链。

### P2 — 关系 / 时间线 / 标签
- [ ] **关系图增强**：图例 + 按实体类型筛选 + 节点头像缩略图 + 聚焦节点高亮邻居 + 移动端双指缩放。
- [ ] **时间线移动端可编辑**：现在 `canDrag = editMode && !isMobile`，手机端改不了事件时间；加「编辑模式」开关 + 拖拽把手，或点击事件弹时间编辑表单。
- [ ] **标签交互**：TagPicker 回车从「误建标签」改为「确认当前选中项」，新建需显式点击「+ 新建」；标签删除加二次确认 + 提示级联影响。

### P2 — 素材与数据
- [ ] **相册升级为全局素材库**：按实体类型/标签过滤、时间排序、批量操作；理顺移动端底栏「相册」与「角色/事件/国家」的层级关系（gallery 子 tab 命名易混淆）。
- [ ] **完整备份**：导出前明确提示「不含图片二进制」，提供「完整备份（含图片 zip）」选项，解决换机图片失效。

### P3 — 打磨
- [ ] **空状态引导**：列表/图谱/时间线为空的统一引导 + 快捷创建按钮。
- [ ] **快捷键可发现性**：`/`（斜杠命令）、`@`、`[[` 首次进入编辑器引导提示。
- [ ] 移动端断点缺口（640–768px：菜单 `hidden sm:flex` 与侧栏 `max-md:hidden` 不一致）。
- [ ] 移动端选词栏滚动跟随非首段（`MobileTextSelectionBar` 只取第一个 `.section-fade`）。

---

## 二、技术重构（独立 PR，风险较高）

### P2 — 数据层
- [ ] **统一到 React Query**：characters / events / world 仍是手写 `useState + refreshKey + data-updated` 事件；countries 已用 React Query。统一后删除事件总线与 `refreshKey`。
- [ ] **泛型 CRUD 仓储**：消除 characters / events / countries / world 4 份 services + 5 份 hooks 的复制。
- [ ] **World `content` 单格式迁移**：JSON 字符串 / HTML 字符串 / `document` 对象三形态收敛（需数据迁移 + 兼容读取）。

### P2 — 组件拆分（God 组件）
- [ ] `src/features/timeline/components/TimelineView.tsx`（1353 行）
- [ ] `src/components/editor/EditorCore.tsx`（~1000 行，含 DOM 手搓弹层 ×3）
- [ ] `src/app/page.tsx`（570 行，视图路由/返回栈/滑动动画抽 hook）

### P3 — 死代码清理
- [ ] `saveDocument` ×4（characters/events/countries/world）
- [ ] `sync.ts` 的 `markAsPending` / `markAsSynced` / `getPendingItems`（同步 stub）
- [ ] `WorldEditor.tsx`、`EditorToolbar.tsx`、`AlbumTriggerContext.tsx`（零引用）
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
