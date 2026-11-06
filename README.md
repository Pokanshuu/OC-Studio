# OC Studio

本地优先的原创角色（OC）与世界观创作工作台。

当前版本：**v0.20.0-beta**（测试版 · 新功能预览）

> ⚠️ **这是测试版**：只用于预览新功能，**不保证对旧版本（v0.19.2 及更早）的备份与笔记库、以及 OC-editor 的兼容性**。试之前请先复制一份笔记库。
>
> - 上一版：[Pokanshuu/OC-Studio v0.19.2-beta](https://github.com/Pokanshuu/OC-Studio/releases/tag/v0.19.2-beta)
> - 旧架构：[nekibud/OC-editor v0.18.3](https://github.com/nekibud/OC-editor/releases/tag/v0.18.3)
>
> v0.20.0-beta 已发布，PR 恢复接收（见「贡献」）。

---

## 功能

### 版面自己定

角色、事件、国家、词条、宠物、武器都能换模板：封面、头像、基本信息、关系、标签、图片、时间、地点、简介、正文，要哪些、谁在前，拖一下就好。也能自己建模板、复制着改，或只给某一篇单独换；宠物和武器的字段组可以改，也能新建一组。

### 同一个库，多种看法

- **卡片 / 画廊 / 列表**：一屏看脸，或一排封面横向翻，或只留名字快速找。
- **表格**：一屏改四个模块的常用信息。
- **地图**：角色、国家、事件钉在地图上，画国界和道路，换六种底图，导出图片。
- **时间线**：谁在什么时候参与，事件之间连线。
- **关系图**：拖着摆位置、拉线建关系、双向箭头、框选一批一起动。
- **相册**：全库图片自动汇总。

### 写作

- **编辑器**：表格、待办、图片、`@` 提到、`[[` 内链。
- **小说**：一章一篇，书架、分页预览，导出 Word / Markdown / TXT。
- **随手记**：顶栏灯泡，想到就写，写完一键变成笔记。
- **搜索**：`Ctrl/Cmd+K` 连正文一起搜。

### 导出

- **海报**：六种版式，高清 PNG，角色 / 事件 / 国家页头直接导出。
- **网站**：三种版式，一个 `index.html`，双击能看，也能直接发布。
- **文档**：Word / Markdown / TXT，导出前先预览。
- **备份**：`.ocbak`，图片一起带走。

### 外观

11 套配色（亮暗各一套）、背景图、封面卡黑白、Mica 半透明窗口。

### 插件

- **地图生成器**：选种子和大陆形状，生成一张能直接用的底图。
- **助手**：能读你的设定库，帮你改字段、写正文、连关系，每次改动先问你。

### 数据

桌面版一个文件夹就是一套设定集，改了什么写回什么，没动的笔记不动；回收站按批次存，重名不会互相覆盖。

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

1. Fork 后克隆，装依赖（Node.js 20.9+）：

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
