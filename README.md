# OC Studio

本地优先的原创角色（OC）与世界观创作工作台。

当前版本：**v0.18.0-alpha · local-first**

本仓库在 OC-Studio 原有角色 / 事件 / 国家 / 词条 / 时间线 / 关系图谱骨架上增量扩展，
新增了**程序化世界地图生成器**与**可折叠树形表格**。运行时完全离线：无账号、无云同步、
无遥测、无崩溃上报、无分析埋点、无自动更新。

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

**世界地图生成器（新增）**
- 1024 × 1024，纯前端 TypeScript + Web Worker，固定 seed 可复现。
- 高程：大陆掩码、分层 Simplex 噪声、domain warping、种子山带 + ridged noise 主脊/山麓。
- 水文：Priority-Flood 填洼、流向追踪、汇流加宽、湖泊蓄水、入海三角洲。
- 气候：纬度温度梯度、海拔递减、盛行风带、迎风坡降雨与背风坡雨影。
- 生物群系：温度 × 湿度 Whittaker 查表 + 海岸/湿地/高山修正。
- 视图：地形着色、等高线（Marching Squares）、温度、降水、生物群系、沿线地形剖面。
- 一次生成缓存底图图层；切换按钮只换渲染器。剖面视图可在地图上按住拖动画线，实时采样高程与群系。
- 地图参数与种子写入 Dexie，并随 JSON / ZIP 备份导出；相同 seed + 参数可重建完全相同的图层。

**树形表格（新增）**
- 可折叠层级、缩进、属性列、单元格内联编辑。
- 三个同源视图：词条树 / 国家树 / 按国家分组的角色。
- 直接读写 Dexie 的 `worldEntries`、`countries`、`characters`，不是独立数据集。
- 支持搜索、展开/折叠全部、新增根/子项、删除与子项提升。

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
- JSON（`.ocbak`）或 ZIP（`oc-data.json` + `manifest.json` + `README.txt`）。
- 包含角色、事件、国家、词条、标签、嵌入关系、地图 seed 与参数。
- 4 种合并策略（跳过/覆盖/保留两者/清空导入）。
- 导入时递归剥离外部图片 URL。

---

## 截图

| 地形 | 等高线 |
| --- | --- |
| ![地形](docs/screenshots/map-terrain.png) | ![等高线](docs/screenshots/map-contour.png) |

| 生物群系 | 地形剖面 |
| --- | --- |
| ![生物群系](docs/screenshots/map-biome.png) | ![剖面](docs/screenshots/map-profile.png) |

![树形表格](docs/screenshots/tree-table.png)

---

## 平台

| 平台 | 说明 |
|------|------|
| Web | 浏览器开发模式，`npm run dev` |
| Windows 桌面 | Tauri v2 打包，原生 Mica 半透明窗口效果 |
| Android | Capacitor v8 封装（首期地图/树表按桌面优先） |

---

## 快速开始

```bash
pnpm install   # 或 npm install
pnpm dev       # 或 npm run dev
```

打开 `http://localhost:3000`。

```bash
npm run build && npx tauri build   # Windows 桌面打包
npm run build && npx cap sync && npx cap open android  # Android 打包
```

> 本工作区也附带 pnpm 配置（`.npmrc` 使用 hoisted linker），可用 `pnpm install` / `pnpm build`。
> 如果 pnpm 提示 ignored build scripts（sharp / unrs-resolver），可执行 `pnpm approve-builds`；
> 这不影响 Next.js 静态导出与地图生成。

---

## 隐私

完整说明见 [PRIVACY.md](./PRIVACY.md)。

- Tauri CSP 以 `default-src 'self'` 为基线；`img-src` 仅允许本地、`data:`、`blob:` 与 AppData asset。
- 无 CDN、外部字体、在线底图或统计脚本。
- 地图计算、编辑器、图谱、导入导出全部在本机完成。
- 图片在桌面端复制到 `AppData/images/`，不引用外部 URL。
- 自动更新默认不做。

---

## 技术栈

Next.js 16 · TypeScript · Tailwind CSS v4 · Tiptap · Dexie.js (IndexedDB) · @xyflow/react · Tauri v2 · Capacitor v8

地图生成器为自研 TypeScript 模块（`src/features/map/generator/`），不依赖在线地图/地形库。

---

## 目录速览

```
src/features/map/            地图生成器、Worker、视图、图例、剖面
src/features/tree-table/     树形表格与内联编辑
src/lib/zip.ts               store-only ZIP 写入 + deflate 读取
src/lib/export.ts            JSON / ZIP 备份
src/lib/import.ts            导入、合并策略与远程 URL 清洗
src-tauri/tauri.conf.json    CSP、asset 协议、窗口配置
PRIVACY.md                   离线与隐私硬约束说明
```

---

## 许可

MIT
