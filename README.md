# OC Studio

本地优先的原创角色（OC）与世界观创作工作台。

当前版本：**v0.20.4-beta**
**不保证对旧版本（v0.19.2 及更早）的备份与笔记库、以及 OC-editor 的兼容性**。升级前请先复制一份笔记库。
>
> - 最新版：[Pokanshuu/OC-Studio v0.20.4-beta](https://github.com/Pokanshuu/OC-Studio/releases/tag/v0.20.3-beta)
> - 使用了该项目的部分功能：[nekibud/OC-editor](https://github.com/nekibud/OC-editor/releases)

---

## 功能

### 自定义版面

角色、事件、国家、词条、宠物、武器都可以选择模板，并通过拖拽调整组件的顺序，以及决定显示或隐藏哪些组件。支持新建模板、复制现有模板后修改，也可以为单篇笔记单独指定模板；宠物和武器的字段组可以修改，也可以新建字段组供其他模板使用。

模板的正文组件可以写一份**预设段落**：新建这条模板的条目时，骨架自动铺进正文，不用每次从空白页开始。

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

- **编辑器**：支持表格、待办、图片、`@` 提及和 `[[` 内链；角色、国家、事件停止输入 1.5 秒后自动保存。
- **小说**：一章一篇，提供书架和分页预览，可导出 Word、Markdown 或 TXT。
- **随手记**：点击顶栏的灯泡即可记录，写完后可以一键转为正式笔记。
- **搜索**：`Ctrl/Cmd+K` 可以搜索正文内容。

### 导出

- **海报**：提供六种版式，可调整封面、字号和背景，导出高清 PNG；角色、事件和国家页面均有入口。
- **网站**：提供三种版式，导出为单个 `index.html`，可直接打开或发布到 GitHub Pages。
- **文档**：支持 Word、Markdown、TXT，导出前可以预览整页；可按条目选择只导单篇或多篇。
- **备份**：导出 `.ocbak` 文件，图片与创作时间线一并包含。

### 外观

提供 11 套配色（亮色和暗色各一套），支持自定义背景图，封面卡可切换为黑白，窗口可使用 Mica 半透明效果。

### 插件

- **地图生成器**：选择种子和大陆形状，生成可直接使用的地图底图。
- **助手**：可以读取设定库，协助修改字段、撰写正文和建立关系，每次修改前都会请求确认。

### 数据

桌面版以文件夹作为笔记库，修改会写回对应文件，未修改的笔记不会被改动；回收站按批次存放，文件重名不会互相覆盖。

---

## 隐私

OC Studio 本地优先。您的笔记、图片和设定默认只保存在自己的设备上。OC Studio 没有账号系统，也不收集使用统计或诊断数据。

- 桌面版把内容写进您选择的笔记库文件夹；移动版保存在应用的本地存储。
- 助手插件是可选功能。使用时，您发送的内容会直接发给您设置的 API 服务商，不经过 OC Studio 的服务器。服务商如何处理数据，取决于它的隐私政策和服务条款。
- 从网址导入图片、打开外部链接，以及查看笔记里的远程图片，会直接访问对应地址。

完整声明见 [`PRIVACY.md`](PRIVACY.md)；应用内见「设置 › 关于 › 隐私声明」。

---

## 规划中

- 统一自动保存与版本历史：角色 / 国家 / 事件改为自动保存；创作时间线增加版本记录、diff 与回滚。
- 国家对国家的关系边：角色、事件、笔记已有显式关系，国家还没有（使节、战争这类边无处可存）。
- 重命名联动文件名（现在只写 frontmatter `title`，文件保持原名）。
- 命令面板与移动端搜索共用一套数据层，还差把两套界面壳合并；移动端 Phase 2。
- 云同步、MCP 接入、第三方插件沙箱、社区模板包（远期）。
- 通用记录模型（模板可定义全新实体类型）：暂时搁置，现有「自建分类 + 模板」够用。

排期与需求见 `docs/todo.md`；哪份文档可信、哪份已经归档见 `docs/README.md`。

---

## 平台

| 平台 | 说明 |
|------|------|
| Web | 浏览器开发模式，`npm run dev` |
| Windows 桌面 | Tauri v2 打包，原生 Mica 半透明窗口效果 |
| macOS 桌面 | Tauri v2 打包（`.app` / `.dmg`），原生红绿灯与系统菜单栏、窗口模糊 |
| Android | Capacitor v8 封装，底部 Tab 导航，编辑器键盘适配 |

安装包未签名，Windows 安全中心可能将 `setup.exe` 判定为威胁；如遇拦截，请改用 MSI 安装包，或在保护历史记录中选择允许。

---

## 快速开始

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。

```bash
npm run build && npx tauri build   # Windows 桌面打包
npm run tauri:build:mac            # macOS 打包（.app）
npm run tauri:build:mac:dmg        # macOS 打包（.dmg）
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
   git clone git@github.com:<您的用户名>/OC-Studio.git
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
   npm run check         # 类型检查 + ESLint + 单元测试 + 全部自检
   ```

   修改笔记库（`src/lib/vault/`、`src-tauri/`）时，再跑一遍 `AGENTS.md` 里列的那组验收脚本。

4. 提交信息 `类型(范围): 一句话`，中文描述；类型取 `feat` / `fix` / `refactor` / `docs` / `chore` / `style`。

5. 推送到自己的 fork，开 PR 指向 `main`。说明里写清改了什么并附上截图。

请勿更改：

`CHANGELOG.md`、`docs/todo.md`、`AGENTS.md` `.opencode` 由维护者在发版时统一更新。

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

OC Studio 是开源软件，按 MIT 许可发布。任何个人或组织都可以检查、使用、修改它的源代码，也可以分发它的副本。分发副本或实质性部分时，需要保留版权声明和 MIT 许可声明。

MIT · 版权归 Pokanshu、nekibud 与贡献者所有。
