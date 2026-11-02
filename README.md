# OC Studio

本地优先的原创角色（OC）与世界观创作工作台。

当前版本：**v0.19.2-beta**

---

## 功能

**概览（主页）**
打开即是世界概览：世界名与简介、角色/事件/国家/词条计数、主要角色、最近更新。侧边栏顶部「主页」入口可随时回到这里。

**角色 / 事件 / 国家**
完整的角色信息卡（简介、生平、立绘、年/月/日 生日），事件支持时间段和负数年份，国家可关联角色与事件。

**世界观百科**
树状词条编辑器，支持 `[[` 内链和 `@` 引用，跨条目串联设定。层级就是目录结构，导出站点时直接变成章节。

**时间线**
年/十年/五十年/百年聚合视图，事件以矩形条展示，支持拖拽调整时间。角色生日会自动落成「某某出生」节点。时期条标记历史阶段，6 色可选。

**关系图谱**
角色、事件、国家之间的可视化网络，6 种关系类型，点击节点跳转编辑。

**编辑器**
斜杠命令、Markdown 快捷输入、表格、待办列表、块拖拽排序。全局复用同一内核。

**全局相册**
角色/事件/国家的图片字段自动聚合，两级分类树，支持搜索过滤。

**暗黑模式**
白天 / 夜间 / 跟随系统，完整设计令牌覆盖。

**全局搜索**
`Ctrl+K` 跨模块模糊搜索，`Ctrl+S` 保存。

**回收站**
软删除，支持恢复和永久删除，30 天自动清理。

**数据导入/导出**
`.ocbak` JSON 格式，4 种合并策略（跳过/覆盖/保留两者/清空导入）。

**静态展示站导出**
一键把整个世界导出成单个 `index.html`：内容、样式、脚本、图片全部内联，改名 `index.html` 就能发布到 GitHub Pages 或任意静态托管，也可以离线打开。

**仓库：文件夹设定集（桌面）**
把一套设定集存成一个普通文件夹：词条即 Markdown + frontmatter，可直接用 Obsidian 打开、用 Git 版本化。改动实时写回文件，**未编辑的笔记零改动**；换机只需拷走文件夹。

---

## 规划中

- 自定义集合（轻量数据库）：集合、记录、自定义字段、关联与反向「所属」。
- 图片导出模板、关系图重写、相册 / 图片组件原子化、网页导出模板。
- 主题系统、社区模板与插件（远期）。

排期与需求见 `docs/todo.md`、`docs/自定义分类-需求文档.md`。

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

## 许可

MIT
