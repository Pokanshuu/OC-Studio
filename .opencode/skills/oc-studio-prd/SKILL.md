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
- **AI 角色**：纯秘书。负责整理（概括、提取标签）、检索（全局搜索）、检查（设定冲突），绝不代写故事、性格、设定。
- **当前版本**：v0.1.7-alpha

## 2. 技术栈约束

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| 前端框架 | Next.js 16 (App Router) + TypeScript strict | 静态导出 (`output: 'export'`) |
| 样式方案 | Tailwind CSS v4 + shadcn/ui | 必须覆盖 shadcn 默认样式以符合设计系统 |
| 本地数据库 | Dexie.js (IndexedDB) v5 | 全局唯一数据源，异步读写 |
| 编辑器 | TipTap (ProseMirror) | 所有富文本编辑共用一个内核 |
| 可视化 | @xyflow/react (关系图) | 自定义组件用于时间线和树状图 |
| AI 集成 | 客户端 fetch 直连 AI API | Key 存 localStorage，无后端代理 |
| 桌面打包 | Tauri v2 | Windows 原生体验 |
| 移动端打包 | Capacitor v8 | Android 原生体验 |
| 移动端剪贴板 | @capacitor/clipboard | 原生剪贴板读写 |
| 图标 | lucide-react | strokeWidth={2} |

## 3. 布局与交互

### 工作台模式（桌面端）
- 四区布局：顶部 MenuBar + 左 120px Sidebar + 中央内容区（含小选项卡） + 底部 StatusBar
- 支持拖拽管理（时间线、树状图），复杂操作提供快捷键和右键菜单

### 移动端工作台（Phase 1，已完成）
- 底部 5 Tab 导航（MobileTabBar）+ 顶部顶栏（MobileTopBar）+ 筛选菜单栏（MobileFilterBar）
- MobileFab 浮动视图切换（网格/列表）
- MobileTopBar 支持动态标题 + 页面动作按钮（折叠/展开），通过 MobilePageHeaderContext 注册
- MobileRelationControls 解耦组件（移动端 fixed 菜单栏 + 桌面端 Panel 双模式）
- CSS-first 壳切换（`max-md:hidden`/`md:hidden`），MobileFilterBar/MobileFab 不使用 `useDevice()` 做条件渲染
- 编辑页自动隐藏移动壳层（MobileTopBar + MobileTabBar），编辑器自带 header
- 系统返回键处理（useBackButton）：编辑页返回列表，列表页退出 App
- 全局禁止文字选择 + 页面缩放（user-select: none / maximumScale=1）
- 回收站改为浮层弹窗，顶栏带毛玻璃模糊效果

### 展示网站模式（计划中）
- 两区布局：左侧侧边栏（导航） + 右侧内容展示区

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

### 4.3 事件模块（已完成）
- 创建、编辑、排序事件
- 支持时间段（开始时间 + 结束时间），结束时间可选，不填默认持续 1 年
- 时间可输入负数（前 X 年），时间线自动处理排序和显示
- 时间、地点、相关角色/国家、AI 概括摘要
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

### 4.6 时间线（已完成）
- 年/十年/五十年/百年聚合视图
- 事件时间段渲染为矩形条，拖拽移动整体或拉伸边缘调整开始/结束时间
- 固定中心缩放（滑块 + Ctrl滚轮），滚轮/触控板横向滚动
- 按角色/国家筛选
- 时期条：时间轴上方渲染彩色时期段，支持添加（+ 按钮）、编辑、删除

### 4.7 时期（Period）功能（已完成）
- 新建 `periods` 表（DB v5）
- 添加/编辑时期弹窗（名称 + 开始/结束时间 + 6 色盘选色）
- 时期条在时间轴上方渲染，位置/宽度随缩放同步
- 时间重叠的时期自动错行（lane 分配）
- hover 显示 X 删除按钮，点击编辑，右键上下文菜单
- 聚合视图下过短时期自动隐藏

### 4.8 关系图谱（已完成）
- @xyflow/react 可视化网络
- 角色（圆形）/事件（矩形）/国家（方形）节点 + 6 种关系类型连线
- 节点点击跳转编辑页
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
- 通用：主题选择、Tauri 自启动开关
- 数据与同步：导入/导出
- AI 与云：API Key、模型、Base URL 配置
- 关于：版本号、GitHub 链接

### 4.17 右键菜单（已完成）
- 编辑器内：撤销/重做/剪切/复制/粘贴/全选/插入子菜单
- 全局 input/textarea：自定义右键菜单（剪切/复制/粘贴/全选）
- 浮层统一到 #overlay-root
- 桌面端：document `contextmenu` 事件统一处理
- 移动端：`useInputContextMenu()` callback-ref hook，在 input 元素自身绑定 pointerdown/pointercancel/contextmenu/pointerup，不监听 document，避免与 Tiptap/MobileTextSelectionBar 等 7 个组件的事件竞争
- 移动端主触发路径：浏览器 `contextmenu` 事件（原生长按信号）；兜底路径：500ms pointerup

## 5. 当前进度（截至 2025-05）

### 已完成（2025-05）
- 移动端 Phase 1 完整上线：MobileTopBar（动态标题+动作按钮）、MobileFilterBar（CSS-only fixed）、MobileTabBar、MobileFab、编辑页壳隐藏、backdrop-blur 统一渲染
- 移动端解耦：MobileRelationControls、MobilePageHeaderContext、MobileFilterBar/MobileFab 纯 CSS 控制
- Android 安全区域沉浸：edge-to-edge + CSS 变量 `--safe-top/bottom`，顶栏/底栏/编辑 header/树浮层全适配，MIUI 白条透明
- backdrop-blur 统一修复：header 移入滚动容器内部，WorldLayout/GlobalAlbum/TrashView 全部生效
- 图标规范统一：折叠=ChevronLeft，展开=Menu，返回=ArrowLeft
- 编辑器返回按钮仅图标化（去文字）
- 缩放系统重构：固定中心缩放，滚轮/触控板横向滚动
- 事件时间段：开始/结束时间矩形条，左/右边缘拉伸，sticky 标题
- 时期（Period）功能：periods 表（DB v5），工具栏 + 按钮，时期条渲染，lane 分配
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
- 旧内核键盘高度检测修复：`KeyboardContext.tsx` 通过 `isBelowTargetVersion()` 分支，旧内核改用 Capacitor 插件原生 `keyboardHeight`（扣 safe-bottom + 微调），现代内核路径不变；`EditorCore.tsx` 工具栏/块菜单加 `paddingBottom: var(--safe-bottom)` 与搜索框一致

### 待处理
- [ ] 关系图谱节点位置持久化（localStorage）
- [ ] 模板系统（模板切换/保存）
- [ ] 旧数据迁移（bio/lifeStory/system 等旧字段清理）
- [ ] 云同步服务端完善
- [ ] 标签系统
- [ ] 展示网站导出
- [ ] 立绘 slider 鼠标拖拽滑动
- [ ] 上传进度指示
- [ ] 图片从全局相册拖拽到编辑器
- [x] 移动端编辑器键盘适配（工具栏、布局稳定、光标防跳）
- [ ] 移动端 Phase 2：搜索框集成、手势支持、更多编辑器移动端能力

## 6. 已知坑与注意事项

### 坑 1：`|| undefined` 导致删除不保存
空串 `|| undefined` → `undefined` → service 的 `if (newValue !== undefined)` 跳过 → 旧值保留。
**已全局清除。**

### 坑 2：全局 `button` hover 规则遮盖图片
`globals.css` 的 `button { @apply hover:bg-paper-alt }` 覆盖透明按钮。
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
```

关键验证项：
- 角色/事件/国家/世界观 CRUD → 保存 → 刷新不丢失
- 图片上传/删除/滑动 → 保存 → 刷新不丢失
- Cmd+K 搜索：角色显示 Q版头像，国家显示 flag
- 暗黑模式切换无闪烁
- 关系图谱节点点击跳转编辑页
- 下拉筛选器 hover 半透明效果
- `npm run build` 无报错
