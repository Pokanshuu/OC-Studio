---
name: oc-studio-codebase
description: >
  OC Studio 代码库地图。定义组件/Provider 层级树、页面渲染模式、关键侵入点、已知陷阱。
  所有 AI 理解代码结构时必须参考此文件。触发词：代码结构、组件树、Provider、渲染模式、陷阱。
---

# OC Studio 代码库地图

> 快速定位：组件在哪、Provider 怎么嵌套、页面怎么渲染、哪些坑不能踩。

## 1. Provider 层级树

```
layout.tsx
└── <body>
    ├── Providers (QueryClientProvider + initImageService)
    │   └── VaultProvider                 ← Vault 上下文（仅桌面；状态由 useSyncExternalStore 派生）
    │       ├── SeedData                  ← 首次运行种子数据
    │       └── KeyboardProvider          ← Capacitor 键盘状态
    │           └── SettingsProvider      ← 主题/同步/AI 设置
    │               └── ActiveEditorProvider  ← 追踪当前聚焦编辑器
    │                   └── EntityNavigateProvider   ← 跨实体跳转 handler
    │                       └── WordCountProvider    ← 字数统计
    │                           └── NavigationProvider      ← activeItem 导航状态
    │                               └── NavigationSourceProvider  ← 导航来源追踪
    │                                   └── VaultGate     ← 装载未完成前不渲染主界面（不支持 vault 则透传）
    │                                       └── AppShell
    │                                           └── GlobalContextMenu  ← InputMenuContext（右键/长按菜单）
    │                                               └── SettingsTriggerContext.Provider
    │                                                   ├── TrashOverlayProvider
    │                                                   │   └── EditorProvider      ← isEditing 状态
    │                                                   │       └── MobileNavigationProvider  ← section + gallerySubTab
    │                                                   │           └── MobilePageHeaderProvider ← title 注册（AppShell 内还挂 VaultWriteBanner + VaultSurfaces）
    │                                                   │               └── AppShellChrome
    │                                                   │                   ├── MenuBar (max-md:hidden)  ← 含 VaultMenuSection
    │                                                   │                   ├── MobileTopBar (md:hidden, 编辑时隐藏)
    │                                                   │                   ├── Sidebar (桌面端)
    │                                                   │                   ├── <main> (统一滚动容器)
    │                                                   │                   ├── StatusBar (max-md:hidden)  ← 含 VaultStatus
    │                                                   │                   └── MobileTabBar (md:hidden, 编辑时隐藏)
    │                                                   ├── Toaster
    │                                                   └── SettingsDialog
    └── OverlayRoot                        ← #overlay-root Portal 容器
```

**关键**：`AppShellChrome` 是 EditorProvider 的子节点 → `useEditor()` **必须**在 AppShellChrome 内调用，不能在 AppShell 顶层调用。

**注意**：`GlobalContextMenu`（提供 `InputMenuContext`）现在位于 AppShell 最外层 → `SettingsDialog`、`MobileSearchOverlay` 等也能用 `useInputContextMenu()`。

**Vault**：`VaultProvider` 在最外层（`Providers` 之下、`SeedData` 同级之上），`VaultGate` 包住整个 `AppShell`。因此 `useVault()` 在任何页面可用；`VaultGate` 在浏览器 / 移动端（不支持 vault）直接 `return children`，不改变原有行为。`VaultWriteBanner`（写盘冲突条）与 `VaultSurfaces`（Welcome + 扫描报告两个全局浮层）挂在 AppShell 内部。

## 2. 页面渲染模式

### 模式 A：display:none 切换（page.tsx）

```tsx
<div className="h-full" style={{ display: showX ? undefined : 'none' }}>
  <XPage />
</div>
```

- **组件始终挂载**，仅通过 `display` 控制可见性
- **不会 unmount** → useEffect 的 cleanup 永远不会因切换到其他页面而触发
- 副作用：context/event listener 必须在条件中检查当前是否"活跃"
- `activeItem === null` 时渲染的是**概览（Dashboard）**——侧边栏顶部「主页」入口就是把它切回 `null`；移动端不提供该入口（移动端 `activeItem` 由 `mobileNav.section` 推导，永不为 `null`）

### 模式 B：编辑器全屏（editing 模式）

```tsx
const { isEditing } = useEditor()
const hideMobileShell = isEditing
```

- `isEditing = true` → `MobileTopBar` + `MobileTabBar` 隐藏，`<main>` 无 `pt-[60px]`
- 编辑器 header 用 `fixed top-0` 占据顶部
- 编辑页内容区需 `max-md:pt-[60px]` 补偿 header 高度
- **WorldLayout 不进入 editing 模式** — 它的 header 用 `sticky`，不是 `fixed`

## 3. 关键侵入点

| 想做的事 | 在哪改 |
|----------|--------|
| 改全局壳层 | `AppShell.tsx` → `AppShellChrome` |
| 改移动端顶栏 | `MobileTopBar.tsx` |
| 改移动端菜单栏 | `MobileFilterBar.tsx`（样式）+ 各 list 页（内容） |
| 改移动端底栏 | `MobileTabBar.tsx` |
| 改导航 | `MobileNavigationContext.tsx` + `NavigationContext.tsx` |
| 改页面标题 | `MobilePageHeaderContext.tsx` ± 各页 useEffect |
| 改编辑模式行为 | `EditorContext.tsx` + `page.tsx`（setEditing/clearEditing） |
| 改界面原子类（按钮/输入/标题/浮层/chip） | **`src/lib/ui-tokens.ts`（唯一源，先改这里）** |
| 改时间线坐标 / 泳道 / 刻度 / 聚合 | `features/timeline/hooks/useTimelineLayout.ts` |
| 改时间线滚动 / 缩放 / 捏合 / 导航 | `features/timeline/hooks/useTimelineViewport.ts` |
| 改概览首屏 | `features/dashboard/components/Dashboard.tsx` |
| 改项目元信息（世界名/简介/封面） | `features/project/services.ts` + 设置弹窗「世界」tab |
| 改分栏布局 | `WorldLayout.tsx` 或 `GlobalAlbum.tsx` |
| 改编辑器 header | 各 `*Editor.tsx` 文件 |
| 改 Vault 落盘行为 | `lib/vault/vault-persist.ts`（Dexie `dbcore` 中间件 + 防抖 flush + `suspend`） |
| 改 Vault frontmatter 读写 | `lib/vault/frontmatter.ts` + `fields.ts`（词表唯一源） |
| 改 Vault 扫描 / 体检 | `lib/vault/scan.ts`（纯函数） |
| 改 Markdown 往返 | `lib/vault/markdown/` + `markdown-bridge.ts` |
| 加 / 改 Rust 文件命令 | `src-tauri/src/vault.rs`（改字段名要同步 TS 门面 `vault-fs.ts`；有 IPC 线格式单测把关） |
| 改 Vault 界面 / 入口 | `features/vault/`（Gate / WriteBanner / MenuSection / Status / Surfaces） |

## 4. 已知陷阱

### 4.1 backdrop-blur 无效（两种根因）

**根因 A**：header 不在 scroll 容器内部（平级兄弟）：

```
✅ <div overflow-auto>          ❌ <div>
     <header sticky backdrop>         <header sticky backdrop>
     <content>                      </div>
   </div>                           <div overflow-auto>
                                      <content>
                                    </div>
```

**根因 B**：scroll 容器有 `padding-top`/`padding-bottom` — padding 是容器的一部分但不是可滚动内容区，内容无法滚动到 padding 区域 → 永远无法经过 fixed bar 背后 → 无模糊。

```
✅ overflow-y-auto (无 padding)              ❌ overflow-y-auto max-md:pt-[60px]
     <spacer h-[60px] />                          <content>
     <content>                                   </div>
     <spacer h-[60px] />
   </div>
```

**修复**：移除 scroll 容器上的 top/bottom padding，改用内容内部的透明 spacer div。

**例外**：ReactFlow 的 viewport 有 CSS `transform` → 创建 GPU 合成层 → `backdrop-filter` 无法穿透 → 关系图移动端控件无模糊（硬件限制，非 bug）。

### 4.2 sticky 与 overflow 冲突

`sticky` 需要元素在 scroll container 内。给同一个元素加 `overflow` 会让它自己变成 scroll container，`sticky` 失效。

```
✅ <div sticky>                  ❌ <div sticky overflow-auto>
     <div overflow-auto>           {treePanel}
       {treePanel}               </div>
   </div>
```

### 4.3 EditorContext 可见性

`useEditor()` 必须在 `EditorProvider` 的子孙节点中调用。AppShell 顶层调用 `useEditor()` 读不到 — 必须抽子组件。

### 4.4 display:none 不 unmount

page.tsx 用 `display:none` 切换页面 → 组件生命周期不停 → useEffect cleanup 不执行。跨页面切换时需在条件中手动清理状态（检查 section、或对比 activeItem）。

### 4.5 移动端壳层 vs 页面级 header

- 编辑页：`hideMobileShell = true` → 壳层隐藏，editor header 自己 `fixed top-0`
- WorldLayout：不进入 editing → 壳层可见，header 用 `sticky`（在 main 的 pt-[60px] 下方）
- 列表页：壳层可见，MobileFilterBar `fixed top-[60px]`，桌面 header `max-md:hidden`

### 4.6 统一滚动规则

**桌面端**：页面外层 `flex flex-col min-h-full`，内容区 `flex-1`（无 `overflow-auto`），由 `<main>` 统一滚动。

**例外**：分栏布局（WorldLayout/GlobalAlbum）用 `flex h-full` + 内部 `overflow-auto`。

**移动端**：section-fade 作为统一滚动容器 (`overflow-y-auto`)，**禁止**设置 `padding-top`/`padding-bottom`。必须用内容内部的 spacer div 偏移内容位置：顶部 `<div className="md:hidden h-[calc(60px+var(--safe-top))]" />`，底部 `pb-24`（≥ MobileTabBar 高度）。这样内容可以滚动经过 fixed bar 背后，backdrop-blur 才会生效。

**分栏页面桌面端**：外层 section-fade 不需要滚动条（滚动在内层容器），需加 `section-fade-no-gutter` class 消除 `scrollbar-gutter: stable` 预留的白条。

### 4.7 scrollbar-gutter 白条 + CSS 层叠陷阱

`.section-fade` 在 globals.css 中设置了 `scrollbar-gutter: stable`（非 layered 样式）。分栏页面（World/Album 桌面端）的滚动条在内层容器，外层 section-fade 不需要滚动条，但 `scrollbar-gutter: stable` 仍预留 ~17px 空间 = 右侧白条。

**不能用 Tailwind utility 覆盖**：`.section-fade` 是非 layered 样式，Tailwind 的 `@layer utilities` 优先级**低于**非 layered 样式 → `md:[scrollbar-gutter:auto]` 不生效。

**正确做法**：globals.css 中新增 `.section-fade-no-gutter { scrollbar-gutter: auto; }`（也是非 layered，放在 `.section-fade` 后面，同层级后声明胜出），需要覆盖的页面同时加 `section-fade section-fade-no-gutter`。

### 4.8 图标规则

| 操作 | 图标 |
|------|------|
| 返回/关闭（页面导航） | `ArrowLeft` |
| 折叠（收侧边栏） | `ChevronLeft` |
| 展开（开侧边栏） | `Menu` |

### 4.9 Android 安全区域沉浸（safe-area）

**原则**：`min-h-[60px]` 不精确 → 用 `h-[calc(60px+var(--safe-*))]` 精确高度。

**CSS 变量**（定义在 `globals.css`）：

```css
--safe-top: env(safe-area-inset-top, 0px);
--safe-bottom: env(safe-area-inset-bottom, 0px);
```

**降级变量**（当 `env()` 返回 0 或不准确时，由 JS 注入）：

```css
--safe-top-estimated  /* 由 estimateSafeAreaInsets() 计算 */
--safe-bottom-estimated
```

`[data-safe-area-fallback="true"]` 时 `--safe-top`/`--safe-bottom` 指向 estimated 值。

**检测逻辑**（`src/lib/browser-compat.ts`）：
- `isSafeAreaEnvAvailable()`：创建临时元素检测 `env()` 是否返回非零值
- `estimateSafeAreaInsets()`：三方案降级 —— CSS 变量读取 → `screen` 差值估算 → 默认值 `{ top: 24, bottom: 16 }`
- `getSafeAreaBottomCorrection()`：模拟器检测 —— `env()` 返回 bottom 值与 `screen` 差值估算偏差 ≥16px 时返回修正值
- 兼容路径放弃大导航栏估算，统一使用手势条高度 16dp

**AppShell.tsx 初始化流程**：
1. 仅移动端 Capacitor 环境执行
2. 100ms/500ms/1s 三次检测 `isSafeAreaEnvAvailable()`
3. `env()` 返回 0 → 完整 fallback（top + bottom 估算）
4. `env()` 返回非零但异常 → 仅 bottom 修正（`getSafeAreaBottomCorrection()`）
5. 现代设备（`env()` 正确）→ 不做任何事
6. fallback/修正激活后 → 添加 `resize` 监听，导航模式切换自动更新

Java 层（`MainActivity.java`）：
- `FLAG_TRANSLUCENT_NAVIGATION` 仅在 `Build.MANUFACTURER == "Xiaomi"` 时添加
- 所有设备：`FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS` + 透明状态栏/导航栏

### 4.10 BubbleMenu 在软换行边界的定位陷阱

**根因**：软换行边界上一个 PM position 对应两个视觉 caret 位置（行末 + 下一行行首）。浏览器 `getClientRects()` 返回两个 rect，但无规则可覆盖所有场景——从 PM position 反推用户点击的是哪一侧**从理论上不可判定**。

**在 `getReferencedVirtualElement` 里折腾 `coordsAtPos`/`getClientRects`/`bias`/rect 选择策略（left 最小/max/rect[0]）是一条死路。**

**正确方案**（`EditorCore.tsx`）：
- 在编辑器 wrapper 上监听 `onMouseDown`，记录 `clientX`/`clientY` 到 ref
- **光标 collapsed**：用点击坐标 + `getComputedStyle(el).lineHeight` 构造虚拟 rect（宽 1px, 高 = 行高, Y = clickY - lineHeight/2），Floating UI 的 `placement: "top"` + middleware 自动完成剩余定位
- **选区非空**：用 `window.getSelection().getRangeAt(0).getBoundingClientRect()` 获取真实 DOM rect，自然跟随拖拽

**核心认知**：浏览器已经处理了视觉换行/双向文本/缩放/字体——用户点哪，bubble 就显示在哪。不要从逻辑位置反推视觉位置。

### 4.11 全局事件监听竞争与 document 级状态机陷阱

**现象**：移动端长按/右键有时正常有时不响应，出现随机行为。

**根因**：项目中 7 个组件同时在 `document`/`window` 上监听 `pointerdown`、`pointerup`、`contextmenu`、`selectionchange`，多个使用捕获阶段 + `stopImmediatePropagation` 互相拦截。加上 WebView 环境下 `contextmenu` → `pointercancel`（不触发 `pointerup`）导致全局状态机残留。

**涉及组件**：GlobalContextMenu、MobileTextSelectionBar、EditorCore、ContextMenu、SlashCommandMenu、WikiLinkExtension、TimelineView

**禁止模式**：
```ts
// ❌ document 级 pointerdown/pointerup 长按检测
document.addEventListener('pointerdown', down)
document.addEventListener('pointerup', up)
// → 每次触摸事件都触发，状态机易被 pointercancel/touchcancel 污染
```

**正确方案**：

桌面端：`contextmenu` 事件在 document 上监听（仅右键触发，低频安全）。

移动端：**组件级事件绑定**，在具体 input 元素自身绑定事件，不监听 document：
- `pointerdown` — 记录位置和时间
- `pointercancel` — 重置状态，防止残留
- `contextmenu` — **主触发源**（浏览器原生长按信号），preventDefault + stopPropagation + 打开菜单
- `pointerup` — **兜底路径**（部分 WebView 不触发 contextmenu），500ms 阈值 + 10px 容差

**架构**（`GlobalContextMenu.tsx` + `use-input-context-menu.ts`）：
- `GlobalContextMenu` 通过 React Context（`InputMenuContext`）暴露 `openMenuAt` 方法
- `useInputContextMenu()` hook 返回 callback ref，在元素自身绑定事件
- 桌面端 input/textarea 由 document 级 `contextmenu` 统一处理
- 移动端 input/textarea 通过 hook 组件级绑定，不参与全局事件竞争
- Context 缺失时 hook 自动降级为 no-op（SSG 兼容）

### 4.12 MobileTextSelectionBar 在 display:none section 切换后未 detach（WebView 崩溃）

**现象**：键盘弹出时切换 tab 或点返回按钮 → WebView 崩溃 → "This page couldn't load"。

**根因**：page.tsx 用 `display:none` 切换 section，旧 section 的组件不 unmount → TSB 仍持有对旧 editor 内元素的引用（`editableRef.current`）和 ProseMirror 事件监听（`selectionUpdate`/`transaction`）。切换后旧 editor 的 DOM 变为不可见（`getBoundingClientRect` 返回全零），TSB 进入死循环：

```
focusin → show(h2) → recalcPosition: no anchor → caret mode
→ focusin → show(h2) → recalcPosition: no anchor → ...
```

最终 ProseMirror 在事件回调中访问 `activeEditor.view.dom` 时抛出未捕获异常 → Chromium 渲染进程崩溃。

**关键误区**：崩溃日志显示 `TypeError: Cannot access view['dom']`，容易误判为"缺少 try-catch 保护 view.dom 访问"。但这只是**最后一环**——真正的问题在更上游：**TSB 状态机没有在 element 变为不可见时退出**。

**修复**（`src/components/shared/mobile-text-selection/`，拆分前是单文件 `MobileTextSelectionBar.tsx`）：

1. **`show` 入口守卫**：在设置 `editableRef.current` 之前检查 `el.isConnected` 和 `el.getBoundingClientRect()` 不全是零 → 拒绝跟踪隐藏元素
2. **`recalcPosition` 健康检查**：每次重算位置时检查已跟踪元素是否脱离文档或零尺寸 → 是则立即 `editableRef.current = null` + `dismiss()` + `setModeBoth('idle')`

```ts
// show 入口
if (!el.isConnected) return
const elRect = el.getBoundingClientRect()
if (elRect.width === 0 && elRect.height === 0) return

// recalcPosition 健康检查
if (!el.isConnected || (elRect.width === 0 && elRect.height === 0)) {
  editableRef.current = null
  dismiss()
  setModeBoth('idle')
  return
}
```

3. **`view.dom` 访问保护**：添加 `safeGetEditorDom()` 辅助函数（try-catch），所有 `activeEditor.view.dom` 访问必须通过此函数

**防御层**：
- `KeyboardContext.tsx`：`handleViewportResize` rAF 节流，每帧最多一次 setState
- `page.tsx`：返回按钮 handler 先 `blur()` 再 50ms 延迟导航
- `MobileTabBar.tsx`：tab 切换前先 `blur()` 当前聚焦元素

### 4.13 浮层遮罩 pointerEvents 不能随 open/visible 变化

**现象**：ActionSheet/Dialog 等浮层打开后，点遮罩空白处 → 关闭动画触发 → 但点击穿透到了遮罩后面的内容。

**根因**：移动端触摸序列 = `pointerdown` → `touchend` → 浏览器合成 `click`。遮罩上 `pointerdown` 触发 `onClose` → `open=false` → `visible=false` → `pointerEvents: none` → 同一个手势序列里后续的 `click` 事件落在遮罩后方元素上。

**正确做法**：遮罩层 `pointerEvents: 'auto'` 始终保持，**绝不能**跟随 `open`/`visible` 状态变化。关闭逻辑只控制 opacity 动画 + 延迟 unmount，不控制 pointerEvents。靠组件卸载（`mounted=false`）释放交互。

```tsx
// ✅ 正确
style={{ opacity: visible ? 1 : 0, pointerEvents: 'auto' }}

// ❌ 错误 — click 事件会在 pointerdown 后穿透
style={{ opacity: visible ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}
```

### 4.14 选词工具栏「更多」动作面板打不开（ACTION_OPEN 先 blur 会自杀）

**现象**：移动端点工具栏的「更多」（三个点）没反应；此后整个选词工具栏直到刷新都不再出现。Android 触摸下必现，桌面自动化点不到。

**根因**：`ACTION_OPEN` 原来先 `editableRef.current?.blur()` 再切状态。

```
blur() → 真的触发 focusout（Android 点按钮不转移焦点时是常态）
→ focusout 处理器看到 modeRef 还是 'caret'（action-sheet 还没设）→ dispatch FOCUS_OUT
→ goIdle() → dismiss() → 200ms 后 setMounted(false)
→ 整个 portal（含动作面板）被卸载，而 modeRef 停在 'action-sheet'
→ 状态机再也回不到 idle，工具栏永久失效
```

**正确做法**：**先进 `action-sheet` 再 blur** —— `focusout` 处理器随即被 `if (modeRef.current === 'action-sheet') return` 挡掉。

```ts
case 'ACTION_OPEN':
  setModeBoth('action-sheet')   // ← 先切状态
  setBarVisible(false)
  editableRef.current?.blur()   // ← 再 blur
  break
```

### 4.15 ref 跨 hook 传递会同时踩两条 React Compiler 规则

把「ref + 用它的 effect」一起搬进自定义 hook 时很自然想让 hook 返回 ref，但：

- 组件里读 `hookRef.current` → `react-hooks/exhaustive-deps` 报「ref 来自别的函数，可能已变」；
- 把 ref 放进依赖数组 → `react-hooks/preserve-manual-memoization` 报「Compilation Skipped: 无法保留手写 memo」；
- 改成 hook 暴露稳定 getter → 仍被 `preserve-manual-memoization` 拦下（`useCallback` 里调 hook 返回值）。

**结论**：这类「ref 与它的写入 effect」要么整体留在组件内（hook 只收其它职责），要么整体进 hook 且**不**把 ref 暴露出去。`EditorCore` 的 `selectionRef` 就是按前者处理（触摸 / 键盘进 hook，选区缓存留组件）。

### 4.16 ImageGallery 的 `grid + enableCrop` 曾把裁剪器挂在死分支

`triggerFileUpload` 在 `enableCrop` 时会 set `rawFileUrl` 并开裁剪器，但裁剪器原来只写在 **slider 分支**里渲染 → `mode="grid" + enableCrop`（角色「立绘」正是这个用法）没有任何地方渲染它，`handleCropComplete` 永不触发 → **上传是空操作**。

**修复**：裁剪器提到公共壳（`image-gallery/ImageGallery.tsx`），`enableCrop && rawFileUrl` 时渲染，与模式无关。新增「带裁剪的上传」路径时，务必确认裁剪器渲染在模式分支**之外**。

### 4.17 Vault：五条不可违背的前提（违反就会弄脏用户文件夹）

Vault 模式下**文件是真源**（`lib/vault/`）。这五条不是风格偏好，是正确性条件：

1. **落盘只挂 Dexie `dbcore` 中间件**（`vault-persist.ts`）。`dbcore.table().mutate` 是所有写入的唯一入口；逐个改 service 一定会漏（service CRUD、批量导入、引用回写、回收站还原、拖拽排序、草稿自动保存各走各的路径）。
2. **只在事务外做 IO**。中间件里只记「(表, id) 脏了」，序列化与写文件留到防抖后的 flush —— Dexie 事务可能回滚。
3. **绝不静默删文件**。`deleteRange`（`clear()`）一律忽略：批量导入的 `replace` 策略会 clear 全表，照做就把整个 vault 删光。真删文件只发生在「回收站里彻底删除」。
4. **未改动就不写**。写回按**文档结构**比较（带装载快照），不是按正文文本比较 —— 这是「未编辑的笔记零字节改动」的关键。
5. **frontmatter 外科式**。只替换我们拥有的键、只替换正文；键顺序与注释原样保留；键名**跟文件已有的走**（保留 `阵营` / `所属国家` 这类中文键）；从不整体重写。键链唯一源 `fields.ts`（读与写共用，结构上消除导入/导出漂移）。

### 4.18 Vault 上下文状态必须「派生」（`useSyncExternalStore`）

`isVaultSupported()` 在服务端为 `false`、客户端为 `true`。直接拿它做 `useState` 初值 → 服务端渲染主界面、客户端渲染加载页 → **水合不一致**。
正确做法：用 `useSyncExternalStore` 读环境（服务端快照固定 `false`），水合后 React 自己重渲染（发生在浏览器绘制之前，看不到闪烁），`status` 再由它与持久配置派生。

### 4.19 `VaultGate`：装载闸门，别在页面里各写各的空白态

vault 装载未完成前**不渲染主界面**（否则列表先按空库渲染一帧再被灌数据冲掉，闪一下）。闸门统一在 `VaultGate`；不支持 vault 的环境（浏览器 / 移动端）直接透传 `children`。写盘冲突用非模态的 `VaultWriteBanner`（别弹模态打断创作）。

### 4.20 Markdown 往返保真：schema 里没声明的东西会被静默丢掉

- **H4 必须在 schema 里**（`editor-config.ts` 已放开到 1–4）：ProseMirror 的 `fromJSON` 只保留 spec 里**声明过**的节点与 attrs，实测 vault 有 21 个 H4。
- **表格 `rawSeparator` 必须声明为 attr**：否则 `|------|-----|` 这类紧凑分隔行被规范化成 `| --- |`，等于改用户排版。
- **`<small>` 必须有 `SmallMark` 标记**：它是 vault 里唯一用到的行内 HTML（实测 32 处），不做成标记就会在正文里露出标签或被丢弃。
- **WikiLink 的 `raw` 属性**：`[[目标#锚点|别名]]` 只按 id 定位节点、原文另存，写回时逐字还原。
