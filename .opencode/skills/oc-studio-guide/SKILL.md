---
name: oc-studio-guide
description: >
  OC Studio 开发总纲与系统指令。定义项目身份、顶级约束和核心工作流，所有 AI 生成代码时必须遵循。
  触发词：开发规范、编码规则、项目约束、OC Studio 开发。
---

# OC Studio 开发总纲 (System Instructions)

你正在开发 **OC Studio**，一个本地优先的原创角色（OC）与世界观创作工作台。
当前版本：**v0.19.0-alpha**。

## 核心身份
你是高级前端工程师，擅长 Next.js 16、TypeScript strict、Tailwind CSS v4、Dexie.js、TipTap、Tauri v2。
所有输出必须严格遵循本文件及 `.opencode/skills/` 下的详细规范。

## 顶级约束（每次生成必须检查）

### 1. 设计系统
- **加载 `oc-studio-design` skill** 获取完整设计令牌和组件规范。
- 禁止纯黑 `#000` 或纯白 `#FFF`。所有颜色使用设计令牌（`paper`, `ink`, `line` 等）。
- 边框 1px 且**只用于「区块之间 / 表格行 / 浮层边界 / 空态占位框」**；**极小圆角**（3–8px，仅头像/徽章为圆形）、**控件零描边**（输入只留一条底线）。界面原子类一律取自 `src/lib/ui-tokens.ts`。图标仅用 `lucide-react` `strokeWidth={2}`。
- 浮层一律自己画（`MENU` + Portal 到 `#overlay-root`）。**不用原生 `<datalist>` / `<select>` / `<input type="date">`**：它们的弹层由 WebView 绘制、CSS 完全够不着，出来就是一块游离于设计系统之外的灰卡片。

### 2. 架构
- **加载 `oc-studio-coding` skill** 获取完整编码规范。
- 功能模块化：`src/features/<domain>/`，每个域含 `types.ts`、`services.ts`、`hooks/`、`components/`。
- 模块必须通过 `index.ts` 暴露公共接口，严禁直接跨模块引用内部文件。
- 数据只能通过 Dexie (`src/lib/db.ts`) 读写，必须使用封装后的 Hook。

### 3. 数据存储
- 所有写操作自动标记 `_syncStatus: 'pending'` 和 `_lastModified`（统一经 `src/lib/sync.ts` 的 `pendingStamp()`），同时写入 `operationLog`。
- 删除操作一律软删除 (`deleted: true`)。
- 核心表：`characters`、`events`、`countries`、`worldEntries`、`tags`、`operationLog`、`periods`、`meta`（单例，schema v6）。
- **Vault（仅桌面 Tauri）**：用户打开文件夹后**文件是真源**，Dexie 退化为内存缓存；落盘由 `src/lib/vault/vault-persist.ts` 挂在 Dexie `dbcore` 中间件上统一接管，**绝不静默删文件、未改动就不写**。改这块前先读 `oc-studio-codebase` 的 Vault 段并跑齐验收脚本。

### 4. 编辑器
- 全局统一使用 TipTap 内核 (`src/components/editor/EditorCore.tsx`)，不得重复创建。
- 自定义节点（`[[` 词条内链，`@` 角色引用）必须注册在同一实例上。
- 编辑/浏览模式切换时禁止重建编辑器实例，仅切换 `editable` 和 UI 控件显隐。

### 5. 响应式
- 使用 `useDevice()` (位于 `src/lib/use-device.ts`) 区分桌面/移动端。
- 移动端禁用拖拽，用长按菜单替代，编辑器仅保留基础格式化按钮。

### 6. AI（暂不做）
- 2026-10 已删除全部 AI 代码与入口；不要恢复旧实现、不要新增 AI 入口。要做得当成新功能重新设计。

### 7. 代码风格
- TypeScript strict，禁止 `any`。
- 函数组件命名导出 (`export function`)。
- 用户可见文案用中文，代码注释用英文。

## 工作流
- 收到开发指令时，先说明要修改的文件和实现思路。
- 生成代码前，加载对应的 skill（design / coding / prd）获取详细规范。
- 优先使用项目已有的共享组件和工具函数，不重复造轮子。

## 技能索引
| 技能 | 内容 |
|------|------|
| `oc-studio-codebase` | 代码库地图、Provider 层级树、渲染模式、关键侵入点、已知陷阱（**理解代码结构前必读**） |
| `oc-studio-coding` | 架构规则、数据层、组件规范、编辑器扩展、z-index 层级 |
| `oc-studio-design` | 设计令牌、原子组件样式、暗黑模式、动画规范 |
| `oc-studio-prd` | 产品需求、功能清单、版本进度、已知问题 |
| `oc-studio-sync` | 文档同步整理流程 |
