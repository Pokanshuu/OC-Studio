<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# OC Studio

**v0.18.0-alpha** — 本地优先的原创角色（OC）与世界观创作工作台。

## 项目身份
- Next.js 16 (App Router) + TypeScript strict + Tailwind CSS v4 + shadcn/ui
- Dexie.js (IndexedDB) 本地数据库，Tauri v2 桌面打包，Capacitor v8 移动端封装
- TipTap (ProseMirror) 富文本编辑器，@xyflow/react 关系图谱
- 图标：lucide-react，图标库禁止使用非 lucide 的图标

## 关键文件路径

### 数据库
- `src/lib/db.ts` — Dexie v4，7 张表（characters, events, countries, worldEntries, tags, operationLog, periods）
- `src/types/index.ts` — 全局类型定义（含 Period 接口 + PERIOD_COLORS）
- `src/lib/sync.ts` — 操作日志 (`logOperation`) + 同步状态

### 编辑器（全局唯一内核）
- `src/components/editor/EditorCore.tsx` — 统一 Tiptap 实例
- `src/components/editor/DocumentEditor.tsx` — 高级封装（加载 document 字段）
- `src/components/editor/WikiLinkExtension.ts` — [[ 词条内链
- `src/components/editor/extensions/ImageBlock.tsx` — 自定义图片块

### 架构
- `src/features/<domain>/` — 功能模块（characters, events, countries, world, timeline, relations, trash, periods）
- 每个模块：`index.ts` (barrel) + `types.ts` + `services.ts` + `hooks/` + `components/`
- `src/components/shared/` — 共享组件
- `src/components/ui/` — shadcn/ui 基础组件
- `src/components/layout/` — 布局（AppShell, Sidebar, MenuBar, StatusBar, OverlayRoot, MobileTopBar, MobileTabBar, MobileFilterBar, MobileFab）

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
- `src/lib/settings.tsx` — 主题/同步/AI 设置
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
- `src/components/shared/ImageGallery.tsx` — slider + grid 双模式
- `src/components/shared/ProfileBannerEditor.tsx` — 头图+头像编辑
- `src/components/shared/FullscreenViewer.tsx` — 全屏查看

### 移动端交互
- `src/components/shared/MobileActionSheet.tsx` — iOS 风格底部弹出菜单（长按触发）
- `src/components/shared/MobileTextSelectionBar.tsx` — 移动端选词工具栏（复制/剪切/粘贴/全选），事件驱动状态机，@capacitor/clipboard 原生剪贴板
- `src/components/shared/GlobalContextMenu.tsx` — 全局 input/textarea 右键菜单，通过 `InputMenuContext` 暴露 `openMenuAt`
- `src/lib/use-input-context-menu.ts` — 移动端 input 组件级长按菜单 hook，在元素自身绑定事件，不监听 document
- `src/lib/tauri-clipboard.ts` — Tauri 剪贴板管理器封装（`tauriReadClipboard`）
- `src/components/shared/DeleteButton.tsx` — 桌面端删除按钮（含 AlertDialog 二次确认）
- `src/lib/useLongPress.ts` — 长按 hook（320ms 阈值，8px 移动容差）
- `src/lib/haptics.ts` — Capacitor 触觉反馈封装

### 配置
- `opencode.json` — OpenCode 核心配置
- `.opencode/skills/` — 5 个技能文件（guide, coding, design, prd, sync）
- `package.json` — 依赖和脚本
- `next.config.ts` — Next.js 配置
- `tsconfig.json` — TypeScript 配置
- `eslint.config.mjs` — ESLint 配置

## 开发命令
```bash
npm run dev       # 开发服务器 (localhost:3000)
npm run build     # 生产构建 (静态导出)
npm run lint      # ESLint
npm run cap:dev   # Capacitor 构建 + 同步 + 打开 Android Studio
npm run cap:hot   # Capacitor 构建 + 同步（热更新）
npx tauri dev     # Tauri 桌面开发
npx tauri build   # Tauri 打包 (.exe/.msi)
```

## 核心约束
1. **设计系统**：加载 `oc-studio-design` skill。禁止 `#000`/`#FFF`，使用设计令牌
2. **数据层**：Dexie 唯一数据源，通过 hooks 访问，软删除默认启用
3. **编辑器**：复用 EditorCore，不创建新实例
4. **浮层**：必须 Portal 到 `#overlay-root`
5. **代码风格**：TypeScript strict，禁止 `any`，`export function` 导出
6. **移动端布局**：CSS-first 方案（`max-md:hidden`/`md:hidden`），不依赖 `useDevice()` 做壳切换
7. **图标规则**：返回/关闭=ArrowLeft，折叠=ChevronLeft，展开=Menu，统一 `strokeWidth={2}`
8. **模糊效果**：`backdrop-blur` 的 header 必须放在滚动容器内部（非平级兄弟）。同时滚动容器**不得**有 `padding-top`/`padding-bottom`，padding 不参与滚动，内容无法到达 fixed bar 背后。必须用内容内部的透明 spacer div 替代（顶部 `<div className="md:hidden h-[calc(60px+var(--safe-top))]">`，底部 `pb-24`）。
9. **安全区域**：所有移动端固定定位元素使用 `h-[calc(60px+var(--safe-top))] pt-[var(--safe-top))]` 模式（精确高度，非 min-h）。CSS 变量定义在 `globals.css`，Java 层在 `MainActivity.java`
10. **移动端触控反馈**：所有移动端可交互控件必须提供按压反馈，分两层规则：
   - **有边框**（`border border-line`）→ `touch-feedback` class，提供 120ms `scale(0.96)` 缩放反馈
   - **无边框** → `active:bg-black/8 dark:active:bg-white/8 rounded-lg`，背景高亮反馈
   CSS 定义在 `globals.css` 的 `.touch-feedback` 规则中。例外：MobileTabBar 和 GlobalAlbum 分类切换按钮保持简洁无感

## 已知差异（技术债，待后续修复）
- `lib/ai/context-builder.ts` 已实现（`buildEntityContext` / `buildProjectContext`），但尚未接线到业务调用（仅 `EventEditor` 直接调 `chatCompletion`）
- 桌面端与移动端折叠/展开图标统一规则需同步到 RelationGraph 的 Controls 组件（当前使用 @xyflow/react 默认图标）

## 待办与改进清单
- 详见 `todo.md`（界面交互设计建议 / 技术重构 / 已知技术债，按 P0–P3 优先级维护）
