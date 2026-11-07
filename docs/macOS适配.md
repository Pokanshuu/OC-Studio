# macOS 桌面端适配

> 分支：`feature/macos-support`（自 `main` / v0.20.1-beta 切出）
> 目标：在 macOS 上 `npm run tauri:dev:mac` 能起、能读笔记库、能写回；`npm run tauri:build:mac` 出 `.app`。
> **Windows 端行为不得改变**（现有用户全在 Windows，这是硬约束）。

---

## 0. 一句话

Windows 的壳是「无边框窗口 + 自绘标题栏 + Mica」，macOS 的壳是「Overlay 标题栏 + 原生红绿灯 + 系统菜单栏 + vibrancy」——**窗口装饰这件事必须按平台分叉，其余代码共用一份**。

---

## 1. 范围

| 属于 | 不属于 |
|---|---|
| 窗口装饰（红绿灯 / 标题栏 / 拖拽区） | Windows / Linux 回归（但要保证不破坏） |
| 系统菜单栏与快捷键（⌘） | App Store 上架 |
| WebKit 与 Chromium 的 API 差异 | 移动端（iOS 壳） |
| 文件访问权限（TCC）与打包产物 | 自动更新 / 公证流水线 |

---

## 2. 已完成（本分支）

| # | 改动 | 文件 | 说明 |
|---|---|---|---|
| 1 | 平台覆盖配置 | `src-tauri/tauri.macos.conf.json`（新增） | `decorations:true` + `titleBarStyle:"Overlay"` + `hiddenTitle` + 红绿灯位置；`bundle.targets` 改为 `app/dmg` |
| 2 | 私有 API 开关 | `src-tauri/tauri.conf.json` / `Cargo.toml` | `app.macOSPrivateApi:true` + `tauri` 的 `macos-private-api` feature（两者必须成对，见 §4.2） |
| 3 | 启动期菜单 | `src-tauri/src/lib.rs` | 不再用 `Menu::default()`（英文 File/Edit/View/Window/Help）。改成**只有系统项的最小中文应用菜单**（隐藏 / 隐藏其他 / 显示全部 / 退出），业务菜单由前端就绪后接管 |
| 4 | vibrancy 修复 | `src-tauri/src/lib.rs` | macOS 分支原来调的是 **Windows 专用** 的 `apply_blur`，改成 `apply_vibrancy(…, UnderWindowBackground, …)` |
| 5 | `OnceLock` 条件编译 | `src-tauri/src/lib.rs` | 只服务 Windows 11 探测，macOS 上会报 unused import |
| 6 | WebKit 兼容 | `src/components/layout/BlurEffect.tsx` | `requestIdleCallback` 在 WKWebView 不存在，退回 `setTimeout` |
| 7 | 首帧平台标记 | `src/lib/env.ts` → `src/app/layout.tsx` | `PLATFORM_BOOT_SCRIPT` 写 `<html data-os>`；**两段 IIFE 之间必须有 `;`**（见 §5.1） |
| 8 | 平台样式 | `src/app/globals.css` | `[data-os='mac']` 下：顶栏左侧 78px 给红绿灯留白、隐藏自绘窗口按钮 |
| 9 | 快捷键标签 | `src/lib/shortcut-label.ts`（新增） | `Ctrl+Shift+Z` → `⌘⇧Z`；只改显示，判定仍同时接受 Ctrl/Meta |
| 10 | 脚本 | `package.json` | `tauri:dev:mac` / `tauri:build:mac`（Windows 的 PowerShell 包装原样保留） |
| 11 | 红绿灯居中 | `src-tauri/tauri.macos.conf.json` | `trafficLightPosition.y` 标定为 **18**：顶栏 32px，实测按钮占 y 9–22.5、中心 **15.8**（目标 16）。映射是 1:1 逻辑像素 |
| 12 | 隐藏窗口内菜单 | `globals.css` + `MenuBarMenus.tsx` | `[data-os='mac'] [data-inapp-menus]` 隐藏「文件/编辑/视图/关于」；品牌名 / 搜索 / 灵感 / 拖拽区保留 |
| 13 | 系统菜单栏（正式） | `src/components/layout/NativeMacMenu.tsx`（新增） | 用 `@tauri-apps/api/menu` 建中文原生菜单：OC Studio / 文件 / 编辑 / 视图，**动作复用 `MenuBarMenus` 的 handler** |
| 14 | 全屏界面让位 | `globals.css` + 导出中心 / 模板编排 / 裁剪 / 看图 / 地图 | 新增 `--oc-titlebar-h`（mac 32px / 其它 0）；全屏界面用它把自己推到标题栏之下，页头不再压红绿灯 |

### 2.1 已验证

| 项 | 结果 |
|---|---|
| `cargo check`（macOS） | 0 错误 0 警告 |
| `npx tsc --noEmit` | 0 错误 |
| `npm run lint` | 0 error / 43 warning（存量） |
| `npx tauri build --bundles app` | 成功，产出 `OC Studio.app` |
| 发布版实跑 | 欢迎页 → 选库 → 主界面正常；红绿灯在左上、自绘窗口按钮已隐藏 |
| 系统菜单栏 | 图证：`OC Studio / File / Edit / View / Window / Help` 已出现 |
| `data-os` | headless 实测落在 `mac`；Windows UA 下为 `other` |
| 快捷键标签 | 四平台用例：Windows/Linux 逐字不变，macOS 变 `⌘⇧Z` |

---

## 3. 待办

### P0-1 红绿灯垂直居中 —— 已完成

标定结果（窗口截图扫像素，2x Retina 换算成逻辑像素）：

| `trafficLightPosition.y` | 按钮实际占位 | 中心 |
|---|---|---|
| 10 | y 1.0 – 14.5 | 7.8 |
| **18** | y 9.0 – 22.5 | **15.8**（顶栏 32px，目标 16） |

结论：**映射 1:1，`y = 18` 即居中**。以后若改顶栏高度，公式是 `y = H/2 + 2`（H 为顶栏像素高）。
**注意**：这个值只在 `titleBarStyle: Overlay` + `decorations: true` 下生效。

### P0-2 全屏界面的「标题栏让位」—— 已完成（发货版已截图验证导出中心）

**背景**：`titleBarStyle: Overlay` 让整个窗口顶部 32px 都处在标题栏里，红绿灯浮在内容之上。
应用主界面有 32px 菜单栏垫着，没问题；但**凡是自己铺满整个窗口、又自带页头的界面**，页头会顶到 y=0，和红绿灯抢位置。

已确认的清单（按需要补 `padding-top` 的优先级）：

| 界面 | 根节点 | 处理 |
|---|---|---|
| 导出中心 `ExportCenter` | `fixed inset-0 flex flex-col` + `h-12` 页头 | **需要**：页头下移到 32px 之下 |
| 模板编排 `TemplateComposer` | 同上 | **需要** |
| 图片裁剪 `ImageCropper` | `fixed inset-0 flex flex-col` + 自带页头 | **需要** |
| 小说阅读 `NovelTree`（整屏态） | `fixed inset-0` | 按实际页头判断 |
| 地图整屏 `MapView` | `fixed inset-0 bg-paper` + 悬浮控制条 | 控制条下移，画布可以仍然铺满 |
| 各种 Dialog / 抽屉 | `fixed inset-0` + 居中 + scrim | **不需要**：内容居中，红绿灯落在 scrim 上本来就是系统惯例 |

实现方式：`globals.css` 的 `--oc-titlebar-h`（macOS 32px / 其它 0），各全屏界面引用它，**不在组件里写死 32**：

| 位置 | 写法 |
|---|---|
| 导出中心 / 模板编排（根节点本来是 `fixed inset-0 flex flex-col`） | `pt-[var(--oc-titlebar-h)]` |
| 裁剪 / 看图（原本已有 `pt-[var(--safe-top)]`） | `pt-[calc(var(--safe-top,0px)+var(--oc-titlebar-h))]` |
| 地图顶栏（`absolute top-3`） | `top-[calc(0.75rem+var(--oc-titlebar-h))]` |

> 注意：**不要取消应用自己的菜单栏**。菜单栏（文件 / 编辑 / 视图 / 关于）在 macOS 上保留，
> 只是右上角那三个**自绘窗口按键**（最小化 / 最大化 / 关闭）隐藏 —— 这几个动作由系统的
> 红绿灯接管，走系统 API。该隐藏已由 `[data-os='mac'] [data-window-controls]` 实现。

### P1-1 TCC 与文件访问（实测：是标准授权框，不是卡死）

**第一次测试被误判成「永久转圈」**：硬盘睡眠 + 授权框没有出现在截图里，看起来像挂死。
**复查结论**：库放 `~/Documents` 时 macOS 会弹**标准 TCC 授权框**——「“OC Studio”想访问“文稿”文件夹中的文件」，点「允许」后正常载入。
**仍然值得做的**：
- 新增 `src-tauri/Info.plist`，补 `NSDocumentsFolderUsageDescription` / `NSDesktopFolderUsageDescription` / `NSDownloadsFolderUsageDescription`，让授权框里能写明用途（Tauri 会把 `src-tauri/Info.plist` 合并进 bundle）；
- 载入期间的状态文案已经够用，但可以补一句「首次访问文件夹需要系统授权」；
- 排查时**先看屏幕有没有授权框**，别再当成挂死。

### P1-2 vibrancy 实测

代码已修好，但「窗口模糊」默认关闭。验证步骤：
`localStorage['blur-effect-enabled']='true'` → 重启 → 截图应看到窗口半透明 + 背后桌面模糊。

### P2 打包 —— `.app` / `.dmg` 均已实测

| 产物 | 命令 | 结果 |
|---|---|---|
| `.app` | `npm run tauri:build:mac` | ✅ `src-tauri/target/release/bundle/macos/OC Studio.app` |
| `.dmg` | `npm run tauri:build:mac:dmg` | ✅ 8.9 MB，挂载后含 `OC Studio.app` + `Applications` 快捷方式 |

**`.dmg` 的坑**：默认会用 AppleScript 让 Finder 摆 DMG 窗口图标，在没给终端授「自动化 → Finder」权限的机器上会**超时**：

```
execution error: "Finder"遇到一个错误：AppleEvent已超时。 (-1712)
```

解决办法是脚本里的 `--skip-jenkins`（跳过美化，只关心能不能装），Tauri 在 `CI` 环境变量存在时会带上它 —— 所以 `tauri:build:mac:dmg` 里写了 `CI=true`。
代价：DMG 窗口没有背景图和图标位置，只是「拖进 Applications」的默认外观。要好看就本机授一次自动化权限再直接 `npx tauri build --bundles dmg`。

其余仍是待办：

- 未签名应用在别的机器上会被 Gatekeeper 拦（`xattr -dr com.apple.quarantine`）；
- 架构：当前只出当前机器架构（arm64）。要 `universal` 需追加 `--target universal-apple-darwin`。

---

## 4. 平台差异（写代码前必读）

### 4.1 Tauri 平台覆盖配置

- 文件名固定 `tauri.macos.conf.json`，与主配置按 **JSON Merge Patch (RFC 7396)** 合并。
- **数组是整体替换**：`app.windows` 里只要漏写一个字段，它不会回落到主配置，而是回落到**默认值**。
  → 窗口对象必须写全（我们就是这么写的：宽高 / 最小宽高 / resizable / decorations / titleBarStyle / hiddenTitle / transparent / trafficLightPosition）。
- 因此 `transparent: true` 在 macOS 覆盖里必须重复一遍，否则图片/模糊的底会变成不透明。

### 4.2 `macOSPrivateApi` 与 Cargo feature 必须成对

`tauri-build` 会做 allowlist 校验：配置里 `macOSPrivateApi: true` 而 `Cargo.toml` 缺 `macos-private-api` feature 时，**直接构建失败**：

```
The `tauri` dependency features ... does not match the allowlist defined under `tauri.conf.json`.
```

反过来也一样。该 feature 自 Tauri 2.12.1 起是空标记（透明窗口的私有 API 已常开），源码里没有任何代码引用它，**对 Windows 构建零影响**——但它是必需的。

### 4.3 WKWebView ≠ Chromium

| 能力 | WebView2 / Chromium（Windows） | WKWebView（macOS） |
|---|---|---|
| `requestIdleCallback` | 有 | **没有**（本项目踩过，直接 ReferenceError 炸整个 `useEffect`） |
| `navigator.userAgentData` | 有 | 没有 → `isMacOS()` 必须回落到 `platform` / `userAgent` |
| `navigator.platform` | `Win32` | **`MacIntel`**（不是 `Macintosh`，用 `/Macintosh/` 匹配会判错） |
| `backdrop-filter` | 前缀 `-webkit-` 亦可 | 需要 `-webkit-backdrop-filter` |
| 滚动条 | 占位 6px | 默认 overlay，要统一外观得显式 `::-webkit-scrollbar` |

**规矩**：新增任何「浏览器能力」调用前，先确认 Safari/WKWebView 有没有；没有就写降级分支，不要只测 Windows。

### 4.4 路径

- 反斜杠只出现在 Windows；`vault-registry` / `vault-paths` 已做归一化，不要新写字符串拼接。
- 大小写敏感（默认 APFS 不敏感，但用户可能改），撞名判断不要靠 `toLowerCase()`。

---

## 5. 踩过的坑

### 5.1 两段 IIFE 拼接必须加分号

`THEME_BOOT_SCRIPT` 结尾**没有** `;`，直接拼 `PLATFORM_BOOT_SCRIPT`（以 `(function(){…})()` 开头）会被解析成「调用前一个的返回值」，运行时抛错，`data-os` 永远落不上，而且不报构建错误。

```ts
// 对：宁可多一个分号
__html: THEME_BOOT_SCRIPT + ';' + PLATFORM_BOOT_SCRIPT
```

### 5.2 `apply_blur` 是 Windows 专用

`window-vibrancy` 的 API 分平台：

| 函数 | 平台 | 签名 |
|---|---|---|
| `apply_blur` | **仅 Windows** | `(window, color)` |
| `apply_vibrancy` | **仅 macOS** | `(window, material, state, radius)` |
| `apply_mica` / `apply_acrylic` | 仅 Windows | — |

仓库里 macOS 分支原先写的是 `apply_blur(&window, None, None, None)`——参数个数与 `apply_vibrancy` 一致、函数名却是 Windows 的。**这段代码从没被编译过**（Windows 构建走不到 `cfg(macos)` 分支），直到本分支第一次在 macOS 上 `cargo check` 才暴露。

### 5.3 构建与 dev server 不能并发

`next dev` 和 `next build` 会抢 `.next`。并发跑出过一个「页面加载失败」的坏 `out/`，排查了很久。
**规矩**：`tauri build` 前先停 dev server。

### 5.4 发布版没有 devtools

release 构建的 `tauri` 没开 `devtools` feature，出错只能靠：
`log stream --predicate 'process == "app"'` / 直接跑 `Contents/MacOS/app` 看 stdout / 用 `tauri dev` 复现。

### 5.5 本机权限（排查用）

- `screencapture` 需要「屏幕录制」授权，否则 `could not create image from display`；
- `osascript … System Events` 需要「辅助功能」授权，否则 `-1728`；
- 只想截某个窗口时：`CGWindowListCopyWindowInfo` 拿 window id → `screencapture -l<id> -o`，比全屏好量像素。

---

## 6. 验证清单

```bash
# 1. 编译（macOS）
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo check

# 2. 类型与规范
npx tsc --noEmit
npm run lint
npm run audit:design

# 3. 开发态
npm run tauri:dev:mac          # 窗口应起、欢迎页可交互

# 4. 打包
npm run tauri:build:mac        # 产物：src-tauri/target/release/bundle/macos/OC Studio.app

# 5. 实跑
open "src-tauri/target/release/bundle/macos/OC Studio.app"
```

验收标准（缺一不可）：

1. 窗口有原生红绿灯，且**垂直居中**；
2. 自绘窗口按钮不出现；
3. 应用自己的菜单栏（文件/编辑/视图/关于）仍在窗口内，可用；右上角没有自绘窗口按键；
4. ⌘C / ⌘V / ⌘Q / ⌘W 可用；
5. 能打开 `/tmp` 下的库，界面进主界面不卡「正在载入文件夹…」；
6. 勾选窗口模糊后，窗口背景是 vibrancy 而不是死色块。

---

## 7. 对 Windows 的影响（承诺）

| 改动 | 为什么不影响 Windows |
|---|---|
| `tauri.macos.conf.json` | 只有 macOS 构建读取 |
| `macOSPrivateApi` + feature | 字段仅 macOS 消费；feature 是空标记，源码无引用 |
| `lib.rs` 菜单 | 整块在 `#[cfg(target_os = "macos")]` |
| vibrancy 修复 | 在 `cfg(macos)` 分支；Windows 的 Mica/Acrylic 分支未改 |
| `OnceLock` cfg | 改成 `#[cfg(target_os = "windows")]`，Windows 上照旧 |
| `requestIdleCallback` | 加了存在性判断，Chromium 仍走原路径 |
| `data-os` / CSS | 选择器全是 `[data-os='mac']`，Windows 落 `other` |
| `shortcutLabel` | Windows 原样返回（已用四平台用例实测逐字相同） |
| `package.json` | 只新增脚本，`tauri:dev` 未改 |
