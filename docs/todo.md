# TODO — OC Studio 待办

> 只记**还没做**的事。已完成的不再留档 —— 看 `CHANGELOG.md` 和 git 历史。
> 优先级：P0 阻塞发版 · P1 近期 · P2 有空再说 · P3 记录在案。

## 挂起（等外部条件，别提前动）

- [ ] **小说 fork 合并**：合并后再做编辑器大纲（要对齐章节结构，现在的 `OutlinePanel` 只是雏形），并拍板 `Ctrl+B` / `Ctrl+K` 键位。
- [ ] **自定义分类与字段扩展**：等基于 `0.18.0` 的 fork 提 PR。需求见 `docs/自定义分类-需求文档.md`。这是跨版本架构迁移（分类、字段、关系图一起动），先出冲突地图（`git merge-tree`）再动手，不要边合边改。

## P1

- [ ] **导出前一致性检查**：落盘队列 `flush()` 只写，不知道磁盘被谁改过。导出 / 关库前比对 mtime，发现外部改动时提示「建议先重新载入」。
- [ ] **World 正文收敛到 `document`**：现在 JSON 字符串（在用）与 `document` 对象（unused）两形态并存，读取处要分支。

## P2

- [ ] **字段自定义剩余四项**：字段行 hover `⋯` 快捷隐藏；自定义字段只支持单行文本；国家暂无字段表（体制 / 地理 / 文化已并进正文）；删掉的自定义字段缺「找回」入口（值还在数据里，设置里没有入口）。
- [ ] **时间线世界级汇总**：现在只有单实体的「历史」弹层（`.ocstudio/journal.jsonl`），没有全库时间线视图。
- [ ] **关系图导出**：角色卡 PNG（`html-to-image` + 隐藏的 800×1200 模板；Tauri 图片必须先转 data URL，否则 canvas 被污染）、整图导出（`getNodesBounds` + `getViewportForBounds`，对 `.react-flow__viewport` 出图而不是截当前视口）、`files.rs` 补 `save_bytes`、默认水印「Created with OC Studio」。
- [ ] **仓储 create/update 模板**：`listActive` / `getById` / `softDelete` 已收敛，create/update 因字段级日志与引用同步差异仍各自手写。

## P3

- [ ] 命令面板与移动端搜索合并（`MenuBarSearch` 与 `MobileSearchOverlay` 现在是两套 UI）。

## 不做（别再提）

AI 功能（代码已整体删除）· 编辑 / 浏览双模式 · 标签交互 · 快捷键可发现性提示 · 相册批量操作 · 「以此为模板新建」。
