# TODO — OC Studio 待办

> 只记**还没做**的事。已完成的不再留档 —— 看 `CHANGELOG.md` 和 git 历史。
> 按领域分节，与 `docs/` 的六份文档一一对应；不属于任何一项的放 §7。
> 优先级：P0 阻塞发版 · P1 近期 · P2 有空再说 · P3 记录在案。
> **设计债总览见 `docs/现状问题.md`**（哪些会出错、根因、修复顺序）。

---

## 1. 模板更新 → `docs/模板.md`

- [x] **P1 阶段一·地基**（2026-11-04）：`src/lib/templates/`（类型 / 组件登记 / 内置模板 / frontmatter 序列化 / 库优先存取）+ `ComponentSection` 壳 + 设置 › 世界 › 模板（开关 / 排序 / 恢复默认）+ `npm run audit:templates`
- [x] **P1 阶段一·接管渲染**（2026-11-05）：`TemplateRenderer` 已接 **词条 / 事件 / 国家 / 角色 / 分类条目**（零迁移，顺序与开关来自模板）；单篇笔记绑定模板（frontmatter `模板:` 键）已落，分类条目就地编辑（`CategoryEntryEditor`），不再跳世界观
- [x] **P2 阶段一·组件参数**（2026-11-05）：`gallery.columns` / `gallery.mode` / `relations.presentation` / `title` 已接角色编辑器（`CharacterFrontmatter`）；参数契约收在 `lib/templates/params.ts`，以 `info.fields` 兼容宠物 / 武器的字段表；`audit:templates` 新增「值合法 / 有消费方 / 能往返」三项，编排行内直接改参数
- [x] **P2 阶段一·参数抽屉**（2026-11-05）：右侧 360px 抽屉（`TemplateComposer`）承载 `relations` / `gallery` 的选择参数与 `info.fields` 字段编排；Esc / 点遮罩 / 完成关闭
- [x] **P2 阶段一·完整编排层**（2026-11-05）：全宽覆盖层（左模板列表 / 中编排 / 右结构预览）+ 组件参数行内编辑（`TemplateComposer`）
- [x] **P1 自定义分区（fork 的 `custom-sections`）**（2026-11-05）：分类 = 模板 + 一组笔记；内置分类 **宠物 / 武器 默认不启用**（`lib/categories/builtins.ts`），设置里开关，侧栏只列启用的分类；老库同名分类原地升级
- [x] **P1 分类收口 · 移动端**（2026-11-05）：手机「更多」列出已启用的分类（`MobileTopBar`），分类名注册到 `MobilePageHeader`；`MobileSection` 新增 `category`
- [x] **P1 分类收口 · 旧数据**（2026-11-05）：设置 › 世界 › 自定义分类里检测 `kind` / `类别: 武器/宠物` 的旧角色，一次性**复制**为分类条目（封面 / 简介 / 正文 / 标签 / 自定义字段），原角色保留；同名同分类跳过，导入后清掉旧键
- [x] **P1 分类收口 · 排序/搜索**（2026-11-05）：分类列表接 `CategoryListToolbar`（搜索 / 排序 / 移动端筛选条）、`SortableList` 手动拖拽、删除二次确认；排序与视图偏好落 `oc-categories-sort`
- [x] **P1 词条自定义字段**（2026-11-05）：`worldEntry` 开放自建字段（`FieldDef.key` → `WorldEntry.custom`），世界编辑器与分类编辑器共用 `WorldCustomFields`；`.ocstudio/fields.json` 在扫描前登记自定义键（`readFieldConfigFromRoot`），自定义值能读回
- [x] **P1 模板内字段编排**（2026-11-05）：宠物 / 武器把 `info.params.fields` 写进内置模板（物种 / 习性、材质 / 制造者）；`lib/templates/fields.ts` 解析，`WorldCustomFields` 按模板过滤，`TemplateComposer` 内联增删；模板字段键在扫描前登记（`vault/readTemplateFieldKeys`），值能读回
- [x] **P1 基本信息拆两级 + 新建模板**（2026-11-05）：设置 › 世界 › 组件 › 基本信息改成两级 —— 一级列「基本信息模板」（角色 / 词条走 `lib/fields` 字段表；宠物 / 武器 / 自建模板走 `info.params.fields`；事件 / 国家标「开发中」，那张表还没接到渲染器），点进去才是那一份字段表；一级底部「新建模板」建笔记类模板并直接进字段页，可就地改名。`info.fields` 的消费方判定从「宠物 / 武器两条硬编码 id」改成 `TEMPLATE_PARAM_ANY_NOTE` + `isNoteTemplate`，任何笔记类模板都能声明字段（`BasicInfoPanel`）
- [x] **P1 宠物 / 武器字段表对齐改版**（2026-11-05）：按 fork 的 `entity-info.ts` 补全两组字段 —— 宠物 15 项（物种 / 品种 / 性别 / 年龄 / 体型 / 体重 / 外观特征 / 性格 / 习性 / 饮食偏好 / 能力技能 / 出生日期 / 收养日期 / 栖息地 / 当前状态），武器 12 项（武器类型 / 材质 / 稀有度 / 尺寸 / 重量 / 制造者 / 铸造时间 / 来源 / 使用条件 / 能力效果 / 属性元素 / 当前状态）；那边给旧 `Character` 列做映射的 `legacy` 项没带过来（我们一律走 `custom`）
- [x] **P2 分类条目进关系图**（2026-11-05）：只收「有引用的分类笔记」为 `world` 节点，引用落成「引用」边；双击节点打开分类条目；节点形态复用国家 3:2 卡片，封面走 `flagUrl`；拖动坐标落 `graph_position`（vault `WORLD_KEYS.graphPosition`）；筛选条增加「分类」开关（移动端图标）
- [x] **P2 落盘对象标量**（2026-11-05）：`frontmatter.emitScalar` 对 `{ x, y }` 写 YAML flow mapping，不再把 `graph_position` / `map_position` 写成 `[object Object]`；`vault-migrate-check` 补分类条目封面 / 简介 / 自定义字段 / 关系图坐标断言，68 项
- [x] **P2 分类视图**（2026-11-05）：目录 / 卡片 / 画廊三态（`CategoryViewToggle` + `CategoryCard` / `CategoryGalleryCard`），偏好 `oc-categories-view`；卡片 / 画廊已接 3:2 封面
- [x] **P1 分类封面槽位**（2026-11-05）：`WorldEntry.cover` + `WorldCoverField`（世界 / 分类编辑器共用），vault `cover` / `封面图`，卡片 / 列表缩略图与备份引用都接上
- [x] **P2 静态站分类详情**（2026-11-05）：词条详情页输出 3:2 封面、简介、分类名与自定义字段（宠物物种 / 习性、武器材质 / 制造者），`collectSiteImages` 收录 `WorldEntry.cover`；`audit:site` 23 项
- [x] **P2 分类画廊**（2026-11-05）：`CoverFlow` 顶排 + `VerticalSplit` 底排目录，`oc-categories-gallery-split` 记高度；无图时衬线首字占位
- [x] **P2 笔记模板真实预览**（2026-11-05）：宠物 / 武器 / 词条模板从最近一篇真实笔记取封面 / 标题 / 字段 / 标签 / 简介 / 正文
- [x] **P2 实体模板真实预览**（2026-11-05）：角色 / 事件 / 国家取最近实体，接封面 / 标题 / 字段 / 关系 / 画廊 / 时间 / 地点；画廊取真实缩略图（最多 4 张）
- [x] **P2 预览交互**（2026-11-05）：封面 / 画廊缩略图点开 `FullscreenViewer`，可左右切换、Esc 关闭
- [x] **P3 预览关系跳转**（2026-11-05）：点关系 → 关编排层 / 设置 → `navigateToEntity` 打开真实角色 / 事件
- [x] **P3 预览标签跳转**（2026-11-05）：点标签 → 关编排层 → 设置 › 世界 › 标签管理（标签暂无限定列表页）
- [x] **P2 模板海报导出**（2026-11-05）：`TemplatePoster` 1080 宽排版 + `html-to-image` `toPng` + `downloadMediaFile` 落盘；导出弹窗可选内容组件 / 留白 / 背景 / 署名，选项记 `oc-image-export`，文件名按标题，浏览器实测 `示例角色C.png`
- [x] **P2 模板编排 · 移动端**（2026-11-05）：窄屏隐藏左模板列表 / 右预览，只留编排列；顶栏收成返回图标 + 标题 + 导出图标 + 完成
- [x] **P2 图片导出预设**（2026-11-05）：`.ocstudio/exports.json`（浏览器退化为 `oc-export-presets`），保存 / 应用 / 删除命名预设；设置可标默认（`defaultImagePresetId` / `defaultSitePresetId`），打开弹窗自动套用
- [x] **P2 网站导出预设**（2026-11-05）：复用 `exports.json` 的 `site` 段，保存 / 应用 / 删除站点标题 + 六个分区 + 纸色 + 内联图片；浏览器退化为 `oc-export-presets`
- [x] **P2 内置导出预设**（2026-11-05）：角色卡 3:4 / 方卡 1:1 / 竖版 9:16 三项常驻，可应用、可设默认、不可删；改版式后另存为自定义预设
- [ ] **P2 关系图整图导出**：`getNodesBounds` + `getViewportForBounds` 对 `.react-flow__viewport` 出图
- [x] **P2 网页导出 · 逻辑审计**（2026-11-05）：`refLink` 未知 kind 不再生成 `#/undefined/...`、只有 `endTime` 时不再渲染「 ~ 2020」、`dateLabel` 改本地日历（东八区不再少一天）、角色详情页路由改为按列表排序后的 id（原来点 A 可能打开 B）；`npm run audit:site` 19 项断言
- [x] **P2 网页导出 · 配置界面**（2026-11-05）：`SiteExportDialog`（预览左 / 配置右）；标题、六个分区开关、纸色三选、内联图片、桌面 / 手机预览；配置存 `oc-site-export`；预览与导出共用 `buildSite()`
- [x] **P2 网页导出 · 时间线 / 详情 / 移动端 / 打印**（2026-11-05）：时间线改竖线 + 节点圆点；详情头像压进头图；移动端导航吸顶 + 横向滚动；`@media print` 去侧栏 / 去内边距 / 卡片不跨页；旧 HTML 正文降级成纯文本（不再画原始标签）
- [x] **P2 网页导出 · 视觉稿剩余**（2026-11-05）：逐页截图过了主页 / 角色 / 事件 / 国家 / 词条 / 关系 / 时间线 / 详情 / 移动端 / 打印 / 暗色；补了卡片网格空块、双向关系重复、暗色跟随。**封面因为 Mock 库没有世界封面，未实际验**
- [ ] **P2 网页导出 · 封面与真实库验收**：用带世界封面 / 大量图片的真实笔记库再走一遍
- [x] **P2 标签管理**（2026-11-05）：设置 › 世界 › 标签；使用篇数（扫四张实体表）、改名、合并、删除、颜色；改名/合并/删除走 `db.tags` 与实体 tag id，文件重写交给落盘队列（没有 aliases 读取层，见 `docs/模板.md` §8.8）
- [x] **P2 阶段二·一 · 拆掉「存反向」**（2026-11-05）：成员关系只留实体侧 —— 角色 `countryId`、事件 `countries`；国家页的「相关角色 / 相关事件」改成查询（`listCountryCharacters` / `listCountryEvents`，国家编辑器用「查询 + 本地覆盖」，覆盖只在未保存时存在）。`lib/membership.ts` 从镜像写入退成**单向应用**（`applyCountryCharacters` / `applyCountryEvents` + 两个 purge），关系图拖拽只写权威侧、并删掉 `markMembership` 那套「两侧都有」判定（边天然完整）。盘上旧的 `country.characters` / `country.events` **不写、不删**（扫描仍读回来保真，但没有界面路径依赖，类型上已标注退役）；静态站国家详情、模板预览计数、角色列表的分组都改成按实体侧统计
- [ ] **P2 阶段二·一 · 收尾**：确认没有遗留读点后再把 `country.characters` / `country.events` 从扫描与 frontmatter 词汇表里摘掉（连带 `vault-migrate-check` 的断言）
- [ ] **P2 阶段二·二**：关系改显式边 `关系: [{类型, 目标, 名称}]`（角色之间无序对、只存发起方）+ 字段 / 时间 / 地点统一成 frontmatter 键
- [ ] **P3 字段自定义剩余三项**：字段行 hover `⋯` 快捷隐藏；国家暂无字段表（体制 / 地理 / 文化已并进正文）；删掉的自定义字段缺「找回」入口
- [ ] **P3 阶段三**：通用记录模型（模板可定义全新实体类型）
- [ ] **挂起 自定义集合（L2）**：等基于 `0.18.0` 的 fork 提 PR；需求见 `docs/自定义分类-需求文档.md`（已被 `docs/模板.md` 取代，仅作参考）。实现前先出冲突地图（`git merge-tree`），再按文档 P1–P4 分期，不要边合边改
- [ ] **远期 社区模板包**（图片 / 网站模板导入）：依赖导出预设与阶段一先落地 → 见 `docs/插件.md` §1

---

## 2. 时间线更新 → `docs/时间线.md`

- [x] **P2 参与者轨道**（2026-11-05）：主轴 + 参与者条（全跨度）+「未归属」兜底 + 超过 8 个角色折叠成「角色（N）」/收起；参与时段仍不做
- [x] **P2 关键节点**（2026-11-05）：事件块改为「浅底 + 悬停出线 + 选中墨线」，关键节点左侧 3px 墨色实心条 + `font-medium`；工具栏「大事表 / 全部事件」筛选已有
- [x] **P2 事件连线**（2026-11-05）：正交折线 + 同一对去重 + 只连两端都可见的事件 + 悬停显示关系名 + **选中事件时连线换墨色并常显关系名**（点参与条选中）
- [x] **P2 世界级汇总时间线**（2026-11-05）：视图 › 创作时间线；读 `.ocstudio/journal.jsonl` 全库记录，按本地日期分组，显示时间 / 动作 / 标题 / 路径 / actor；只读，不做回滚
- [x] **P2 密度切换 / 只显示事件**（2026-11-05）：视图 › 时间线 › 简 / 详；详 = 第二行「时间 · 参与者名字」；「参与者轨道」可关，关掉后画布只留事件

---

## 3. 关系图更新 → `docs/关系图.md`

- [x] **P2 静态手摆 demo**（2026-11-05）：拖动写回 `graphPosition`、「保存布局」、「整理」+ 撤销、正交 / 曲线切换、**8px 网格吸附 + 8px 中心对齐参考线**；参数已回填 `docs/关系图.md` §3
- [x] **P2 边名显隐**（2026-11-05）：关系名默认不画；悬停节点显示相邻边名、悬停单条线或打开样式面板显示那一条（`RelationEdge` 的 `showLabel`）
- [x] **P2 节点形态**（2026-11-05）：角色 = 圆形头像，国家 / 事件 = 矩形卡；点阵底；「整理」按钮 + 撤销
- [x] **P2 并行边错开**（2026-11-05）：同一对节点的多条关系，正交走车道、曲线走法线偏移（`relationEdgePath` 的 `parallelIndex`）
- [x] **P2 边型切换**（2026-11-05）：设置里「正交 ↔ 曲线」，存应用设置 `edgeStyle`；曲线用自动浮动贝塞尔
- [x] **P2 边配色（12 档，文字同色）**（2026-11-05）：令牌 `--oc-accent-1..12` + `relation-colors.ts`，边面板与渲染已接。**来自她的 PR #5，提交时署名**
- [x] **P2 箭头方向**（2026-11-05）：无 / 正向 / 反向 / 双向，落 frontmatter `箭头`，边面板可改。**来自 PR #5 的能力对齐**
- [x] **P2 框选多选 + 鼠标模式**（2026-11-05）：右键平移 / 左键平移 + Shift 框选（设置项），已接。**框选能力来自另一位贡献者的 PR，提交时署名**
- [x] **P2 新建节点默认落点**：`computeForceLayout` 对无坐标节点在已钉住节点周围排环，不叠在原点
- [ ] **P3 图上组件原子化**：数据无关的 `nodes / edges / config` 输入，可在集合视图复用
- [ ] **P3 编组框 / 锁定**（框选已提前到 P2）

---

## 4. 相册更新（不确定）→ `docs/相册.md`

- [ ] **P3 图片组件原子化**：`PhotoItem` / `PhotoSource` 适配器 + `PhotoCard` / `PhotoGrid` / `PhotoStrip` / `PhotoViewer` / `PhotoPicker` / `PhotoField`；`ImageGallery` 与 `GlobalAlbum` 退化为组合
- [ ] **P3 全局照片选择器** `PhotoPicker`（是否所有图片字段默认弹「从相册选择」待定）

**状态：方向未定。** 等模板阶段一落地、图片槽位（`docs/模板.md` §4.1）定稿后再动，否则会跟着槽位改两遍。

---

## 5. 插件与 Agent → `docs/插件.md` · `docs/Agent接入.md`

**v1 只对内**：能力层 + 内置 agent。**MCP 与插件沙箱全部后置**（对外接口是整套安全面：端口 / token / 权限 UI / 沙箱 / 崩溃隔离）。

- [x] **P2 A1 只读能力层**（2026-11-05）：`src/lib/capabilities/`（`Caller` 权限入口 / list / get / search / graphSlice）+ Dexie 适配器；`scripts/capabilities-check.ts` 19 项断言。**没有 MCP / REST 传输层**
- [x] **P2 A2 图鉴切片装配**（2026-11-05）：`buildCodexSlice()` 把字段 / 关系 / 相关事件 / 标签 / 正文装配成 markdown；**还没被导出卡 / 静态站复用**（先保住唯一实现）
- [ ] **P2 A3 内置 agent**：对话壳（复用作者已有安卓原生 AI 应用里预留的 agent 能力）+ 官方 skill（角色讨论 / 设定补全 / 小说续写 / 一致性检查）+ 模型可换
- [ ] **P2 A4 `actor` 留痕 + 受限写入**：journal 每条加 `actor`（**格式已落，写入侧未接**）；权限四级（只读 / 写正文 / 改结构 / 删除），默认只读，写入必须走落盘链路
- [ ] **P3 官方插件：地图生成器**：读国家 / 词条 → 渲染 SVG/Canvas → 导出 PNG（见 `docs/地图.md`）。先做成**内置模块 + 插件形状的接口**，等沙箱就绪再真正装成插件
- [ ] **P3 Skill 系统**：内置官方 skill；用户可安装 skill（只含提示词与工具声明，不含可执行代码，比插件更容易开放）
- [ ] **远期 B MCP 适配器 + 本地 REST**：同一份工具定义直接导出成 `tools/list`，不重写
- [ ] **远期 C 插件沙箱**：iframe / Worker + manifest + 白名单 RPC + 逐项权限 + 本地导入
- [ ] **远期 插件开发文档**：等两个官方插件跑通后再写，从样本里长出来（先写必过时）

**明确**：不做内置 AI（摘要 / 一键生成 / 内置对话），界面上不出现「AI」字样（`AGENTS.md` 约束 15）。内置 agent 是**可插拔的壳**（模型 / skill 可换），不是写死的功能按钮。`v1 不做"用户自定义组件"`（`docs/模板.md` §12），插件是它的唯一通路，必须带沙箱。

---

## 6. 主题更新 → `docs/主题.md`

- [x] **P2 官方主题 v1（2026-11-05）**：4 套（纸白 / 亚麻 / 松烟 / 青瓷），只换亮暗纸色 / 墨色 / 线色；`src/lib/theme/presets.ts` + `applyThemePreset()`，设置 › 个性化 › 纸色；`npm run audit:palettes` 查亮暗对比度
- [x] **P2 令牌归属登记**：每个令牌标明 `shell` / `page` / `both`（页面级主题只能改 `page`，碰不到外壳）—— 这是"换国家背景不会连带换菜单栏"的机制保证
- [x] **P2 背景图 v1**（2026-11-05）：设置 › 个性化 › 背景；压缩（长边 2560 WebP）→ Tauri 写 `.ocstudio/backgrounds/`（浏览器 Mock 用 data URL）→ `html.oc-background` 铺图 + 纸色 wash；填充 / 平铺 / 固定；遮罩 20–80%（默认 35%）；有图时关 Mica
- [ ] **P2 应用级主题（外壳 + 背景）· 材质**：颜色与背景已落（见上），**材质（纯色 / 渐变 / 模糊 / 边线有无 / 密度）与 2–3 套内置外壳样式仍未做**；结构（侧栏位置、菜单栏形态、内容是否卡片化）不开放
- [x] **P2 背景图随库**（2026-11-05）：`background-<时间>.webp` 写进 `.ocstudio/backgrounds/`，设置只存相对路径；换背景 / 移除时删旧文件。**Tauri 路径未在真机跑过，浏览器 Mock 只验了 data URL 退化**
- [ ] **P2 背景图剩余**：原图 / 压缩版分离、移动端默认关
- [ ] **P3 页面级主题**：模板挂主题 id（「不同国家的角色不同背景」），依赖模板阶段一
- [ ] **远期 主题包**：`theme.json`（scope: app|page）+ 对比度校验 + 导入导出
- [ ] **远期 `--oc-accent`**：先在图表 / 时间线 / 关系图开放，界面控件不开放

---

## 7. 小说 → `docs/小说.md`

- [ ] **P2 合并小说 fork**：先出冲突地图（`git merge-tree`），再统一大纲（`OutlinePanel` → `buildEntryTree`），并拍板 `Ctrl+B` / `Ctrl+K` 键位
- [ ] **P2 章节落在 `小说/` 目录**：章节 = 一篇笔记，用文件名前缀排序（`第01章-…`），不另建章节表
- [ ] **P3 导出器**：Markdown（按树拼接）/ TXT / 静态站；EPUB 后置
- [ ] **P3 与设定联动**：章节里 `@角色` 反查"这一章涉及谁"（算出来，不存）；章节挂时间点，在大纲里能看出叙事顺序与世界时间的错位
- [ ] **P3 小说目录默认不进关系图 / 相册**（否则章节会被当成实体拉进图里）

---

## 8. 地图 → `docs/地图.md`

- [x] **地图界面改版（2026-11-05）**：整屏画布 + 浮层（查看 / 编辑态、天气式地图选择器 `MapSwitcher`、图层卡片 `MapModeCard`、`MapCanvas` 的 `bleed`）；见 `docs/地图.md` §10
- [x] **P1 地图模式切底图（方案 A）**：视图条 `MapViewStrip` 六档 → `renderMapView()`（插件 Worker 里 `generate` + `render`）→ 落 `.ocstudio/maps/<地图名>-<视图>.png`（固定名原地覆盖）→ 写 `map_mode` + `map_image`；锚点不动。`map_mode` 已贯通 `types` / `fields` / `scan` / `serialize`
- [ ] **P2 移动端视图条**：现在 `md:` 以上才显示（底部一排控件在窄屏会互相压住），等移动端统一收口时再摆
- [x] **P1 地图生成器可用**：无底图时底部给「生成地图」一级入口；参数面板补「形态」（尺寸 世界/区域、大陆 地球型/三大陆/群岛/盘古）+ 六个滑块；生成 → 用作底图 → 视图条切六档
- [x] **P1 政治标注（线）**：`annotations.ts`（模型 + JSON 读写 + 命中测试）、`AnnotationLayer`（SVG 矢量层）、右键画国界 / 道路、拖动加点、完成 / 取消 / Esc、右键删除；落 `map_annotations`（已贯通 `types` / `fields` / `scan` / `serialize`）。**点不重复做**：城市 / 地点就是锚点
- [x] **P2 政治标注（区域填充）**（2026-11-05）：右键国界 →「填充色...」12 档色板 + 无填充；`fill` 存色板中文名、渲染 22%；`map-anchor-check` 13 项断言
- [ ] **P2 政治标注（拖国家建国 / 放城市）**：fork 的「拖国家到地图上建国 / 放城市」还没做；城市 / 地点仍复用锚点
- [x] **P1 地图图例**（2026-11-05）：`MapLegend` 按视图给色带 / 生物群系 / 政治图例；色值照抄渲染器，左下浮层显示（压住「图层」按钮上方）
- [x] **P1 地图库 / 地图详情**（2026-11-05）：`MapLibraryDialog` 逐张列尺寸 / 类型（生成图 / 手绘底图 / 空白）/ 锚点数 / 标注数 / 当前；行内重命名、删除（确认），底部新建。锚点按 `map_id`（地图名）统计，空 `map_id` 单独报「未归属」
- [x] **P1 剖面抽屉**（2026-11-05）：右键「取地形剖面」→ 沿两点采样 `renderMapProfile` → `ProfileDrawer` 折线 + 生物群系色带 + 采样进度；**不进视图条**
- [x] **P1 政治标注**：国界多边形 / 道路 + 城市点（城市 / 地点复用锚点，不另存）落 `map_annotations`；见上一条
- [x] **P2 地图全屏**（2026-11-05）：右上角全屏 / 退出全屏（`Maximize2` / `Minimize2`），Esc 退出；整屏时藏状态栏与 `DEV · Mock` 标记，画线中 Esc 先交给画线
- [ ] **P2 手绘地图视图**：背景图 + 锚点；点锚点跳实体；缩放平移沿用关系图那套手势
- [ ] **P2 锚点数据**：实体 frontmatter 存 `map_position: {x, y}`（**归一化 0–1**，换分辨率不重摆）；背景图存 `.ocstudio/maps/`
- [ ] **P2 拖动锚点写回实体**（移动端只读）；图层开关：国家 / 事件 / 词条
- [ ] **P3 地图缩略组件**：作为模板 block 塞进国家页（只读）
- [ ] **不做**：真 GIS（投影 / 经纬度 / 等高线）、在应用里画地图、路径规划

---

## 9. 其它（不属于上面八项）

- [ ] **P0 桌面开发壳起不来（WebView2 156 崩溃）**：`tauri dev` / 仓库代码新编的 exe 一律起不来窗口。**Tauri 2.12.5 终于把真实报错露出来**：`failed to create webview: HRESULT(0x800700AA) 请求的资源在使用中`；Windows 事件日志同时记录 `msedgewebview2.exe 156.0.4314.58` **APPCRASH**（`msedge.dll`，异常 `0x80000003`）。即浏览器进程一启动就崩，Tauri 拿不到 webview，窗口对象存在所以表现成闪退。已排除：日志插件、透明窗 / Mica、数据目录、`--disable-gpu`。注意 `WEBVIEW2_BROWSER_EXECUTABLE_FOLDER` 只认 **Fixed Version** 运行时，指 Evergreen 版本目录会报 "Could not find the WebView2 Runtime"。待办：① 重装修复 WebView2；② 若预览版系统继续崩，改发 **Fixed Version**（包体 +约 150MB，Win10 一并考虑）`flush()` 只写，不知道磁盘被谁改过。导出 / 关库前比对 mtime，发现外部改动时提示「建议先重新载入」
- [ ] **P1 World 正文收敛到 `document`**：现在 JSON 字符串（在用）与 `document` 对象（unused）两形态并存，读取处要分支
- [ ] **P2 仓储 create/update 模板**：`listActive` / `getById` / `softDelete` 已收敛，create/update 因字段级日志与引用同步差异仍各自手写
- [ ] **P3 命令面板与移动端搜索合并**：`MenuBarSearch` 与 `MobileSearchOverlay` 现在是两套 UI
- [ ] **P2 封面卡参数定稿**：版式数字集中在 `src/lib/cover/tuning.ts`（「视图 → 封面卡参数」可实时拖，32 项算法自检见 `scripts/cover-check.ts`）。定稿后把 JSON 写回默认值，面板降级成隐藏调试口；细节见 `docs/封面卡.md`
- [ ] **P2 Rust 化（只搬「数据已在磁盘、结果很小、纯函数」的活）**：
  - [ ] **扫描分段**（收益最大）：`vault_scan` 现在把每个 `.md` 全文塞进 IPC（`VaultFile.content`，见 `src-tauri/src/vault.rs`），JS 再逐篇 parse。改成 Rust 切出 frontmatter（`serde_yaml` → `serde_json::Value`）+ body + mtime，TS 只做词表映射 —— **`lib/vault/fields.ts` 仍是唯一词汇表，一行不搬**，所以不会长出第二套规则
  - [ ] **全库 mtime 比对命令**：一次遍历返回「被外部改动的路径」，给上面的导出前检查用（别在 JS 里 N 次 IPC）
  - [ ] **缩略图**：Rust `image` crate 生成 256px，缓存到 `.ocstudio/thumbs/`（相册 / 列表滚动的大头）
  - [ ] **导出图片编码**：`.ocbak` 与静态站的内联图片改由 Rust 读字节直接出 base64（现在 TS 里 `FileReader` + 字符串拼接，大库导出内存翻倍）
  - **明确不搬**：Markdown ⇄ Tiptap 桥（往返规范化规则是唯一真源，搬过去必然漂移）· 力导向布局（正确解法是 Web Worker，且关系图已改静态手摆）· sha256（已是 `crypto.subtle` 原生）· 全文搜索（要索引 + 中文分词，另立项）
- [ ] **P2 重命名联动文件名**：现在改标题只写 frontmatter `title`，文件仍叫旧名 —— 标题与文件名分叉后，`[[标题]]` 只能靠 scan 的宽容键解析，Obsidian 侧认不到。需要「改名 + 移动文件 + 更新被引用链接」一条链
- [ ] **P3 正文桥的既有归因失败**：段落首行缩进空格被吞、`<small>` 内加粗被合并进同一段 —— `vault-markdown-check` 基线里一直红着的那 1 项，属规范化边界，非回归
- [ ] **挂起 小说 fork 合并**：合并后再做编辑器大纲（要对齐章节结构，现在的 `OutlinePanel` 只是雏形），并拍板 `Ctrl+B` / `Ctrl+K` 键位

---

## 不做（别再提）

AI 功能（代码已整体删除）· 编辑 / 浏览双模式 · 标签交互 · 快捷键可发现性提示 · 相册批量操作 · 「以此为模板新建」· **实时物理关系图** · **参与时段（角色中途加入 / 退出）** · 在时间线 / 关系图上新建实体


---

## 合并进度（PR #5，2026-11-03）

**已完成（有提交、有自检）**

- 地基：`src/plugins/map-generator/`（生成器插件化，内置只留视图）、12 档 `--oc-accent-*`、Tauri 2.12.5
- 小说：章节 = 笔记（`parentId`）、书架（封面 2:3）、作品信息 / 章节大纲、导出 Word·Markdown·TXT、分页预览（9:16·16:9·A4）、旧库导入
- 地图：锚点 `map_position` / `map_id`（归一化）、锚点服务、`MapView` 画布、`.ocstudio/maps/` 底图（Rust `vault_list_assets`）
- 关系：边颜色 / 箭头落 frontmatter、画布消费、并行边、点边改样式面板、旧 `relations` 表只读兼容
- 树表：四页签（词条 / 国家 / 角色 / 事件）、树仍走 `buildEntryTree`；主页补三入口
- 角色：文件夹四动作（`folder` 键）、照片·动画「保存到…」、OC 动画上传（`类别` 已废弃，见 §1 自定义分类）
- 兼容：`.ocbak` version 2、小说旧库、关系旧表；地图旧 `db.maps` 明示不导入
- 下一代地基：插件形状接口、主题令牌登记（`audit:theme`）、journal `actor` 留痕

**还没做（按优先级）**

- [ ] 关系图：静态手摆 demo（吸附 / 对齐参考线 / 点阵参数待验证）、节点形态（角色圆 / 国家卡）
- [ ] 框选多选 + 鼠标模式（`docs/关系图.md` §6.1 已定并入 S4，尚未实现）
- [ ] 地图：底图在真机 vault 里验证；「在地图中查看」入口
- [x] **P1 自定义分类**（2026-11-04）：分类 = 名字 + 图标 + 模板 + 一组笔记（复用 `worldEntries` 的 `category` 键）；侧栏「自定义分类」组、设置 › 世界 › 自定义分类、`features/categories/CategorySection`；`类别` / `kind` 已整体删除
- [x] **P1 分类收口**：旧 `类别: 武器/宠物` 数据导入（`CategoriesPanel` 内的非破坏性复制）；移动端入口 / 拖拽排序 / 卡片 / 画廊 / 返回键均已落
- [ ] 界面观感：由作者验收（关系图面板、书架卡片、地图锚点样式）
- [ ] `cargo test --lib` 需在非受限环境跑一遍（本机 `%TEMP%` 写入被拒，12 项全挂在建临时目录）
