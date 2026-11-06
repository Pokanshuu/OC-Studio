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

### 模板与组件

一套组件、一套模板，取代原来「一类实体一套编辑器」的做法。十一个组件（封面 / 头像 / 基本信息 / 关系 / 标签 / 画廊 / 图片 / 时间 / 地点 / 简介 / 正文）在角色、事件、国家、词条与分类条目五个宿主里共用同一套渲染。内置六个模板（角色 / 事件 / 国家 / 词条 / 宠物 / 武器），也可以自建、复制、改名、删除与恢复默认。

基本信息拆成独立的「基本信息组件」（字段组存在 `.ocstudio/info-groups.json`），模板只负责引用。全宽编排层可以拖组件、改参数（关系呈现、画廊模式与列数、图片宽度、时间区间、标题）、看结构预览与真实内容预览；单篇笔记还能用 frontmatter 的 `模板:` 键覆盖模板。

分类 = 模板 + 一组笔记。宠物 / 武器内置但默认不启用，条目复用词条存储，删分类不删笔记。

### 多种视图

- **卡片 / 画廊 / 列表**：列表页三种视图随时切；卡片是封面卡网格（照片下缘渐进模糊 + 自动取色），画廊是 Cover Flow 横向翻页，列表是目录行。
- **表格**：角色 / 事件 / 国家 / 词条四个页签的树形表格，名称与常用字段就地编辑，页签可拖拽调序。
- **地图**：整屏画布，实体锚点、国界 / 道路 / 填充、六档底图、地图库与图例。
- **时间线**：参与者轨道、事件连线、简 / 详密度、时期条。
- **关系图**：静态手摆、8px 吸附与对齐参考线、正交 / 曲线、12 档边色、双向箭头、框选。
- **相册**：跨实体聚合字段图与正文图，两级分类、搜索与来源筛选。

### 写作

- **编辑器**：斜杠命令、Markdown 快捷输入、表格、待办、图片块、块拖拽、`@` 引用与 `[[` 内链，全局共用同一内核。
- **小说**：章节 = 笔记，书架、章节目录、分页预览，导出 Word / Markdown / TXT。
- **灵感便签**：顶栏灯泡打开的可拖小窗，想到就写，一键升级成笔记。
- **全局搜索**：`Ctrl/Cmd+K` 搜标题 / 别名 / 字段 / 正文，多词匹配、结果分组并高亮。

### 导出

统一导出中心（左预览右配置）装下四件事：

- **海报**六套版式（刊首 / 夜色 / 档案 / 胶片 / 素白 / 双栏），封面位置、倍率、字号与背景可调。
- **静态站**三套版式（书斋 / 档案 / 画廊），单文件 `index.html`，内容、样式、脚本、图片全部内联，可直接发布或离线打开。
- **文档**：Markdown / TXT / Word，预览与导出共用同一张纸。
- **备份**：`.ocbak` 单文件，图片内联。

另有小说导出、关系图子图导出、时间线导出；实体编辑器页头有「导出海报」入口。

### 主题与外观

11 套官方主题（中性 4 套：纸白 / 亚麻 / 松烟 / 青瓷；七色 7 套：朱砂 / 琥珀 / 苇黄 / 苔绿 / 海青 / 靛蓝 / 紫苑），亮暗各一套令牌。应用级背景图（填充 / 平铺 / 固定 + 遮罩）、封面卡彩色 / 黑白、Mica 半透明窗口。

### 数据与插件

- **笔记库是真源（桌面）**：一个文件夹 = 一套设定集，词条即 Markdown + frontmatter，可直接用 Obsidian 打开、用 Git 版本化。改动实时写回，未编辑的笔记零改动；回收站按批次分目录，同名笔记不会再撞车。
- **创作时间线**：`.ocstudio/journal.jsonl` 只追加，记录每次真实改动与操作者。
- **插件**：地图生成器（种子可复现，内核与改版逐字节对等）与助手（会话、工具循环、审批，可读写库内条目）。
- **字段与标签**：词条自建字段、字段表显示 / 隐藏 / 改名 / 排序 / 找回；标签改名 / 合并 / 删除与色板。

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
