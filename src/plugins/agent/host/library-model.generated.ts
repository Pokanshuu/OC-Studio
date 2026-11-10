/**
 * AUTO-GENERATED — 不要手改。
 *
 * 来源：`src/lib/capabilities/agent-tools.ts` 的字段白名单 / 图片槽位 / 关系规则 /
 * 界面维护豁免表；字段覆盖由 `scripts/gen-library-guide.ts` 对着
 * `src/types/index.ts` 审计（没有归属就失败）。
 * 重新生成：`npm run gen:library-guide`；漂移检查：`npm run audit:library-guide`。
 */
export const LIBRARY_MODEL_MARKDOWN = `## 能力卡片（由 \`npm run gen:library-guide\` 从能力层生成）

工具能读写的就是下面这些；没列到的列由界面维护，不要试。

### 角色（character）
可写：race / element / occupation / faction / height / birthday / bio
图：avatar / header
关系：character→character / character→country
界面维护：动画 / 角色文件夹 / 图集 / 立绘 / 主要角色标记由界面维护

### 事件（event）
可写：time / endTime / location / summary
图：header
关系：event→character / event→country
界面维护：\`parentEventId\` 是死列（事件没有层级，不要写）；事件关系 / 图集 / 关键标记由界面维护

### 国家（country）
可写：description / system / geography / culture
图：flag / header
界面维护：\`parentId\` 只能从表格页「新增子项」建，工具不读也不写；图集由界面维护

### 词条（world）
可写：summary / time / endTime / location / chapterOutline
图：cover / avatar / image / novelCover
界面维护：归类 / 模板 / 父级用 \`library_set_placement\`；图集 / 地图字段由界面维护；\`relations\` 只读

## 通用规则
- 自建字段只写这条**已有**的键或模板声明过的键（\`library_read\` 会列出）；真·新键才要 \`create_new: true\`
- 正文 = \`library_set_body\`（整篇覆盖，先读再写）；改名 / 别名 = \`library_rename\`；标签 = \`library_set_tags\`
- 新建前先 \`library_search\` 查重：同名条目会直接返回既有 id，不会再建一条
- **id 只在当前库里有效**：每次先 \`library_search\` / \`library_list\` 取当前 id，不要复用上一轮的 id
- 时间 / 生日只收数字年月日（\`1203\` / \`1203-04\` / \`1203-04-15\`，负年份前加 -）；纪年名 / 月名写正文或自建字段
- 在线图片只认**图片直链**（搜索页常被 403 挡）；库里已有的图用 \`path\`
- 写完看**回执**（路径 / 改动键 / 版本），不需要再读一遍文件或翻 journal
- 不要手写 frontmatter 或直接改 \`.md\`：落盘键名与工具字段名不是一套，手改必错
`
