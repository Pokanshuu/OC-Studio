# OC Studio

本地优先的原创角色（OC）与世界观创作工作台。

当前版本：**v0.1.6-alpha**

---

## 功能

**角色 / 事件 / 国家**
完整的角色信息卡（简介、生平、立绘），事件支持时间段和负数年份，国家可关联角色与事件。

**世界观百科**
树状词条编辑器，支持 `[[` 内链和 `@` 引用，跨条目串联设定。

**时间线**
年/十年/五十年/百年聚合视图，事件以矩形条展示，支持拖拽调整时间。时期条标记历史阶段，6 色可选。

**关系图谱**
角色、事件、国家之间的可视化网络，6 种关系类型，点击节点跳转编辑。

**编辑器**
斜杠命令、Markdown 快捷输入、表格、待办列表、块拖拽排序。全局复用同一内核。

**全局相册**
所有图片按角色/事件/国家自动聚合，两级分类树，支持搜索过滤。

**暗黑模式**
白天 / 夜间 / 跟随系统，完整设计令牌覆盖。

**全局搜索**
`Ctrl+K` 跨模块模糊搜索，`Ctrl+S` 保存。

**回收站**
软删除，支持恢复和永久删除，30 天自动清理。

**数据导入/导出**
`.ocbak` JSON 格式，4 种合并策略（跳过/覆盖/保留两者/清空导入）。

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

## 许可

MIT
