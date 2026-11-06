/**
 * AUTO-GENERATED — 不要手改。
 *
 * 来源：`src/types/index.ts` 的四个接口 + `src/lib/capabilities/agent-tools.ts`
 * 的字段白名单 / 关系规则。
 * 重新生成：`npm run gen:library-guide`；漂移检查：`npm run audit:library-guide`。
 */
export const LIBRARY_MODEL_MARKDOWN = `## 数据模型（由 \`npm run gen:library-guide\` 从 \`src/types/index.ts\` 生成）

### character（角色）
- \`name: string\`
- \`aliases: string[]\`
- \`race: string\`
- \`element: string\`
- \`occupation: string\`
- \`faction: string\` 阵营 / 立场（vault 侧 frontmatter 键：阵营 或 faction）。自由文本，不强制归一
- \`countryId?: number\`
- \`height: string\`
- \`birthday: string\`
- \`avatarUrl: string\`
- \`headerUrl?: string\`
- \`bio: string\`
- \`animationUrl?: string\` OC 动画（视频或多帧）：库里附件路径，空 = 没上传
- \`folder?: string\` 角色文件夹名（空 / 缺省 = 未分组）；删文件夹不删角色
- \`relatedCharacters: RelatedCharacter[]\`
- \`relatedNotes?: WorldRelation[]\` 角色的「相关笔记」：目标只能是 \`WorldEntry\`。 与 \`relatedCharacters\` 分开存，因为盘上要解析的目标类型不同； 形状与笔记自己的 \`relation…
- \`gallery: GalleryImage[]\`
- \`avatars: AvatarImage[]\`
- \`tags: number[]\`
- \`isMajor?: boolean\` 主要角色标记（用于概览与导出首页精选）
可写标量：\`race\`、\`element\`、\`occupation\`、\`faction\`、\`height\`、\`birthday\`、\`bio\`

### event（事件）
- \`title: string\`
- \`aliases?: string[]\` 别名（vault 侧 [[ ]] 链接的解析键之一；改名时旧名会推进这里）
- \`time: string\`
- \`endTime?: string\`
- \`location: string\`
- \`summary: string\`
- \`characters: number[]\`
- \`countries?: number[]\`
- \`headerUrl?: string\`
- \`parentEventId: number | null\`
- \`relations: EventRelation[]\`
- \`tags: number[]\`
- \`images: ImageEntry[]\`
- \`isMajor: boolean\`
可写标量：\`time\`、\`endTime\`、\`location\`、\`summary\`

### country（国家）
- \`name: string\`
- \`aliases?: string[]\` 别名（vault 侧 [[ ]] 链接的解析键之一；改名时旧名会推进这里）
- \`parentId: number | null\`
- \`description: string\`
- \`system: string\`
- \`geography: string\`
- \`culture: string\`
- \`flagUrl?: string\`
- \`headerUrl?: string\`
- \`gallery?: GalleryImage[]\` 图集（模板「画廊」组件；落盘键 gallery）
- \`tags: number[]\`
可写标量：\`description\`、\`system\`、\`geography\`、\`culture\`

### world（词条）
- \`title: string\`
- \`aliases?: string[]\` 别名（vault 侧 [[ ]] 链接的解析键之一；改名时旧名会推进这里）
- \`cover?: string\` 分类条目的封面（3:2 槽位，落盘键 cover）；普通词条一般不设
- \`avatar?: string\` 头像（1:1 槽位，落盘键 avatar）；模板「头像」组件写这里
- \`image?: string\` 单张图片（落盘键 image）；模板「图片」组件写这里
- \`gallery?: GalleryImage[]\` 图集（落盘键 gallery）；模板「画廊」组件写这里
- \`time?: string\` 开始时间 / 结束时间（落盘键 time / endTime）；模板「时间」组件写这里
- \`endTime?: string\`
- \`location?: string\` 地点（落盘键 location）；模板「地点」组件写这里
- \`summary?: string\` 一行简介（分类条目的副标题 / 列表摘要；落盘键 简介）
- \`category: string\` 自定义分类归属（空 = 普通词条，进世界观目录树；小说根是 \`小说\`、地图笔记是 \`地图\`）。 历史上它兼过层级用途，那部分早已由 \`parentId\` 取代；盘上仍有老文件的 \`…
- \`template?: string\` 单篇覆盖的模板名（空 = 跟随分类 / 内置词条模板；落盘键 模板）
- \`parentId: number | null\`
- \`novelAuthor?: string\` 小说根节点：作者 / 简介 / 目标字数 / 作品笔记（其它词条不会有）
- \`novelSynopsis?: string\`
- \`novelTargetWords?: number\`
- \`novelNotes?: string\`
- \`novelCover?: string\` 小说封面（2:3 槽位）
- \`mapImage?: string\` 地图：底图相对路径 + 像素尺寸（category=地图 才有）
- \`mapWidth?: number\`
- \`mapHeight?: number\`
- \`mapSeed?: number\` 生成用的种子与参数快照（JSON 字符串）
- \`mapParams?: string\`
- \`mapMode?: string\` 当前显示的视图（\`terrain\` / \`contour\` / …）。只有生成过的地图才有
- \`mapAnnotations?: string\` 政治标注（国界 / 道路）：JSON 字符串，坐标归一化 0–1（\`features/map/annotations.ts\`）
- \`chapterOutline?: string\` 章节：大纲 / 备注（一行说明，不是正文）
- \`relations: WorldRelation[]\` 手写的命名关系（目标只能是另一篇笔记）。 与 \`parentId\`（层级）和正文 \`[[ ]]\` / \`@\`（提及）**分开存**： 层级只能有一个父级、正文是文字；只有「叫得出名…
- \`tags: number[]\`
可写标量：\`summary\`、\`chapterOutline\`

关系（\`library_link\`，只写发起方）：
- character→character（\`relatedCharacters\`）
- character→country（\`countryId\`，即国籍）
- event→character（\`characters\`）
- event→country（\`countries\`）

写字段（\`library_set_fields\` —— 内置列和自建字段**同一个工具**，不用先判断）：
- 键命中上面各节的「可写标量」→ 写实体列；同名的自建字段以列为准（不会分叉）
- 其余键必须是这条条目**已有的**自建字段（\`library_read\` 的「自建字段」一段就是键名 → 值）
- 确实要新建一个自建字段，才传 \`create_new: true\`；否则打错一个字就会多出一个看不见的脏字段
- 显示名不是键名：键以 \`library_templates\`（模板字段）和 \`library_read\` 为准
`
