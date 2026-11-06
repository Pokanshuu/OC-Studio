# OC Studio

本地优先的原创角色（OC）与世界观创作工作台。

当前版本：**v0.20.0-beta**

> ⚠️ **这是测试版**：只用于预览新功能，**不保证对旧版本（v0.19.2 及更早）的备份与笔记库、以及 OC-editor 的兼容性**。试之前请先复制一份笔记库。
>
> - 上一版：[Pokanshuu/OC-Studio v0.19.2-beta](https://github.com/Pokanshuu/OC-Studio/releases/tag/v0.19.2-beta)
> - 旧架构：[nekibud/OC-editor v0.18.3](https://github.com/nekibud/OC-editor/releases/tag/v0.18.3)
>
> v0.20.0-beta 已发布，PR 恢复接收（见「贡献」）。

---

## 功能

### 自定义版面

角色、事件、国家、词条、宠物、武器都可以选择模板，并通过拖拽调整组件的顺序，以及决定显示或隐藏哪些组件。支持新建模板、复制现有模板后修改，也可以为单篇笔记单独指定模板；宠物和武器的字段组可以修改，也可以新建字段组供其他模板使用。

### 浏览方式

- **卡片**：以封面为主的网格，封面自动取色，下缘做渐隐处理。
- **画廊**：横向翻页浏览封面。
- **列表**：只显示名称和少量信息，便于快速查找。
- **表格**：在同一个页面修改角色、事件、国家、词条的名称、种族、职业、国籍。
- **地图**：将角色、国家、事件标记在地图上，绘制国界和道路，切换六种底图，并导出为图片。
- **时间线**：查看参与者与时间的关系，事件之间可以连线。
- **关系图**：拖动节点调整位置，拖拽建立关系，支持双向箭头和框选。
- **相册**：自动汇总全库图片，可按来源和标签筛选。

### 写作

- **编辑器**：支持表格、待办、图片、`@` 提及和 `[[` 内链。
- **小说**：一章一篇，提供书架和分页预览，可导出 Word、Markdown 或 TXT。
- **随手记**：点击顶栏的灯泡即可记录，写完后可以一键转为正式笔记。
- **搜索**：`Ctrl/Cmd+K` 可以搜索正文内容。

### 导出

- **海报**：提供六种版式，可调整封面、字号和背景，导出高清 PNG；角色、事件和国家页面均有入口。
- **网站**：提供三种版式，导出为单个 `index.html`，可直接打开或发布到 GitHub Pages。
- **文档**：支持 Word、Markdown、TXT，导出前可以预览整页。
- **备份**：导出 `.ocbak` 文件，图片一并包含。

### 外观

提供 11 套配色（亮色和暗色各一套），支持自定义背景图，封面卡可切换为黑白，窗口可使用 Mica 半透明效果。

### 插件

- **地图生成器**：选择种子和大陆形状，生成可直接使用的地图底图。
- **助手**：可以读取设定库，协助修改字段、撰写正文和建立关系，每次修改前都会请求确认。

### 数据

桌面版以文件夹作为笔记库，修改会写回对应文件，未修改的笔记不会被改动；回收站按批次存放，文件重名不会互相覆盖。

---

## 规划中

- 阶段二·二：关系改显式边，字段 / 时间 / 地点统一成 frontmatter 键。
- 通用记录模型：模板可定义全新的实体类型。
- 重命名联动文件名（现在只写 frontmatter `title`）。
- 命令面板与移动端搜索合并成一套壳；移动端 Phase 2。
- 云同步、MCP / 插件沙箱、社区模板包（远期）。

排期与需求见 `docs/todo.md`。

---

## 平台

| 平台 | 说明 |
|------|------|
| Web | 浏览器开发模式，`npm run dev` |
| Windows 桌面 | Tauri v2 打包，原生 Mica 半透明窗口效果 |
| Android | Capacitor v8 封装，底部 Tab 导航，编辑器键盘适配 |

---

## 快速开始

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。

```bash
npm run build && npx tauri build   # Windows 桌面打包
npm run build && npx cap sync && npx cap open android  # Android 打包
```

---

## 技术栈

Next.js 16 · TypeScript · Tailwind CSS v4 · Tiptap · Dexie.js (IndexedDB) · @xyflow/react · Tauri v2 · Capacitor v8

---

## 贡献

开发前先阅读 `AGENTS.md`。

**提 PR**

1. Fork **最新仓库**后克隆，装依赖（Node.js 20.9+）：

   ```bash
   git clone git@github.com:<你的用户名>/OC-Studio.git
   cd OC-Studio
   npm install
   ```

2. 从最新的 `main` 新建分支

   ```bash
   git switch -c fix/xxx      # 修 bug
   git switch -c feature/xxx  # 加功能
   ```

3. 提交前自检

   ```bash
   npx tsc --noEmit      # 类型检查
   npm run lint          # ESLint（存量警告不算失败）
   npm run audit:design  # 设计令牌检查
   ```

   改到笔记库（`src/lib/vault/`、`src-tauri/`）时，再跑一遍 `AGENTS.md` 里列的那组验收脚本。

4. 提交信息 `类型(范围): 一句话`，中文描述；类型取 `feat` / `fix` / `refactor` / `docs` / `chore` / `style`。

5. 推送到自己的 fork，开 PR 指向 `main`。说明里写清改了什么。

请勿更改：

`CHANGELOG.md`、`docs/todo.md`、`AGENTS.md` 由维护者在发版时统一更新。

**冲突**

分支落后于 `main` 时，维护者会在合并前把冲突解掉，您不用 rebase，也不用重新提 PR。

**issue**

新增模块、改数据层 schema、更改设计令牌、文档等，可以先开 issue 或者私信讨论。

提交即视为同意以 MIT 许可发布。

---

## 贡献者

- [Pokanshuu](https://github.com/Pokanshuu)
- [nekibud](https://github.com/nekibud)
- [AyaoUwU](https://github.com/AyaoUwU)

---

## 许可

MIT · 版权归 Pokanshuu、nekibud 与贡献者所有。
