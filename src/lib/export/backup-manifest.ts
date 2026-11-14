/**
 * 持久 store 的备份清单 —— **唯一登记表**。
 *
 * 为什么单开一份：`.ocbak` 的覆盖面以前是靠读 `payload.ts` 与 `backup-config.ts`
 * 猜出来的。新加一份 store（灵感、分类空文件夹…）时没人知道它该不该进备份，
 * 漏掉也不会有人报错 —— 审查 F15 就是这么来的。
 *
 * 规矩（与 `docs/审查报告.md` 的「备份清单」边界一致）：
 * - 每个会落盘的 store 都在这里登记：**路径 / 内容 / 是否包含 / 恢复策略 / 是否含用户内容**
 * - 新增 store 必须在这里二选一：`included` 或 `excluded` + 给人看的 `reason`
 * - 排除项也要出现在备份界面上，不能只写在代码注释里
 * - 助手会话与密钥属于插件自己的存储，**永远排除**，也不允许打包密钥
 *
 * 这份清单是纯数据（不 import 任何 store），导出、导入预览、界面都能直接读。
 */

export type BackupDisposition = 'included' | 'excluded'

export interface BackupStore {
  /** 稳定 id（报告 / 测试用） */
  id: string
  /** 界面上的人话名字 */
  label: string
  /** 存在哪：库内相对路径 / 应用数据目录 / 外部存储 */
  location: string
  /** 里面是什么 */
  contents: string
  disposition: BackupDisposition
  /** 恢复策略（included）或「为什么不恢复」（excluded） */
  restore: string
  /** 是否含用户创作内容（含正文 / 图片 / 灵感这类不可再生内容） */
  userContent: boolean
  /** 排除原因（excluded 必填；界面要展示） */
  reason?: string
}

/**
 * 全部持久 store。**导出侧按 `included` 真实打包，排除侧必须能说清原因。**
 *
 * 浏览器预览（没有笔记库）里，这些 store 退化成 localStorage；清单描述的是
 * 笔记库形态，导出时读到的是同一份内存快照。
 */
export const BACKUP_STORES: readonly BackupStore[] = [
  {
    id: 'entities',
    label: '实体与词条',
    location: '库内 Markdown（角色 / 事件 / 国家 / 词条 / 小说 / 地图）+ Dexie 会话缓存',
    contents: '角色、事件、国家、词条、标签、时期、项目信息与它们的 frontmatter / 正文',
    disposition: 'included',
    restore: '按合并策略写入 Dexie；开着笔记库时再落成文件',
    userContent: true,
  },
  {
    id: 'images',
    label: '图片与动画',
    location: '`附件/`、`.ocstudio/maps/` 与实体字段引用',
    contents: '头像 / 封面 / 立绘 / 图集 / 正文图 / 动画 / 小说封面 / 地图底图（内联为 data URI）',
    disposition: 'included',
    restore: '随字段写回；读不到字节的保留原路径并计入缺图清单',
    userContent: true,
  },
  {
    id: 'journal',
    label: '创作时间线',
    location: '`.ocstudio/journal.jsonl`',
    contents: '只追加的操作记录（谁在什么时候改了哪条）',
    disposition: 'included',
    restore: '按 `ts + relPath + hash` 去重后追加，同一份备份导两次不会重复',
    userContent: true,
  },
  {
    id: 'tagMeta',
    label: '标签颜色与分类',
    location: '`.ocstudio/tags.json`',
    contents: '标签的颜色 / 分类（实体正文里只写标签名字）',
    disposition: 'included',
    restore: '随 tags 表一起恢复，写回文件时按标签名重新落盘',
    userContent: false,
  },
  {
    id: 'categories',
    label: '分类',
    location: '`.ocstudio/categories.json`',
    contents: '自建分类与内置分类的开关 / 顺序',
    disposition: 'included',
    restore: '目标还没有任何自建 / 改过的设置时整段恢复，否则整段保留',
    userContent: false,
  },
  {
    id: 'fields',
    label: '字段表',
    location: '`.ocstudio/fields.json`',
    contents: '角色 / 事件 / 国家的字段行（顺序 / 显示名 / 自建字段）',
    disposition: 'included',
    restore: '目标还没有任何自建 / 改过的设置时整段恢复，否则整段保留',
    userContent: false,
  },
  {
    id: 'templates',
    label: '模板',
    location: '`.ocstudio/templates/*.md`',
    contents: '每个模板的组件顺序 / 开关 / 参数 / 名称 / 别名',
    disposition: 'included',
    restore: '目标还没有任何自建 / 改过的设置时整段恢复，否则整段保留',
    userContent: false,
  },
  {
    id: 'infoGroups',
    label: '基本信息组',
    location: '`.ocstudio/info-groups.json`',
    contents: '可复用的字段组（内置项与自建项）',
    disposition: 'included',
    restore: '目标还没有任何自建 / 改过的设置时整段恢复，否则整段保留',
    userContent: false,
  },
  {
    id: 'bodyGroups',
    label: '正文组',
    location: '`.ocstudio/body-groups.json`',
    contents: '可复用的正文骨架（内置项与自建项）',
    disposition: 'included',
    restore: '目标还没有任何自建 / 改过的设置时整段恢复，否则整段保留',
    userContent: false,
  },
  {
    id: 'characterFolders',
    label: '角色文件夹清单',
    location: '`.ocstudio/folders.json`',
    contents: '角色文件夹名单（空文件夹靠它留住）',
    disposition: 'included',
    restore: '目标还没有任何自建 / 改过的设置时整段恢复，否则整段保留',
    userContent: false,
  },
  {
    id: 'worldFolders',
    label: '分类空文件夹清单',
    location: '`.ocstudio/world-folders.json`',
    contents: '按分类分组的文件夹名单（空文件夹靠它留住）',
    disposition: 'included',
    restore: '目标还没有任何自建 / 改过的设置时整段恢复，否则整段保留',
    userContent: false,
  },
  {
    id: 'inspirations',
    label: '灵感',
    location: '`.ocstudio/inspirations.json`',
    contents: '随手记的正文原文、标题、时间与「已升级成哪篇」的标记',
    disposition: 'included',
    restore:
      '按 id 幂等合并：同 id 同内容跳过；同 id 不同内容另存副本（冲突保留双方并报告）；已有内容一律不覆盖',
    userContent: true,
  },
  {
    id: 'exportPresets',
    label: '导出预设',
    location: '`.ocstudio/exports.json`',
    contents: '海报 / 网站导出预设与默认预设指针',
    disposition: 'excluded',
    restore: '不恢复：导出偏好，换机器后可按需要重新配置',
    userContent: false,
    reason: '导出偏好不是创作内容；打包它会让「设置整段保留」的判定多出一类无关状态',
  },
  {
    id: 'trash',
    label: '回收站',
    location: '`.ocstudio/trash/`',
    contents: '已删除的笔记与素材（按保留期自动清理）',
    disposition: 'excluded',
    restore: '不恢复：备份只覆盖活跃数据，删除项不还原',
    userContent: true,
    reason: '回收站是「已经删掉的东西」；把它们塞回备份会让恢复重新带回用户明确删除的内容',
  },
  {
    id: 'backgrounds',
    label: '应用背景图',
    location: '`.ocstudio/backgrounds/`',
    contents: '设置 › 个性化里的应用背景（与设定集无关）',
    disposition: 'excluded',
    restore: '不恢复：属于应用外观，在设置里重新选择',
    userContent: false,
    reason: '外观素材不属于某个笔记库的创作内容',
  },
  {
    id: 'legacyBackups',
    label: '旧版迁移自动备份',
    location: '`.ocstudio/legacy-backup-*.ocbak`',
    contents: '旧版本数据迁移前的自动快照',
    disposition: 'excluded',
    restore: '不恢复：需要时在笔记库里直接找这个文件',
    userContent: true,
    reason: '它本身是另一份备份；再打包一次会让文件成倍变大，两份数据也没有合并语义',
  },
  {
    id: 'appSettings',
    label: '应用设置',
    location: 'localStorage（应用级设置）',
    contents: '主题 / 界面偏好 / 时间线密度 / 回收站保留天数等',
    disposition: 'excluded',
    restore: '不恢复：应用级偏好，不属于某个笔记库',
    userContent: false,
    reason: '换机器后按新环境重选更合适；混进设定集备份会覆盖本机偏好',
  },
  {
    id: 'assistantStorage',
    label: '助手会话与密钥',
    location: '系统 app 数据下的插件 SQLite + 系统钥匙串',
    contents: '助手会话 / 消息 / 工作目录绑定 / API 密钥',
    disposition: 'excluded',
    restore: '不恢复：助手插件自己的存储；**密钥永不进入 `.ocbak`**',
    userContent: true,
    reason: '助手有独立的存储与密钥边界（own-storage）；把会话或密钥打进设定集备份等于扩大泄露面',
  },
] as const

export const BACKUP_MANIFEST_VERSION = 1

/**
 * 配置段 key → 清单里的 store id。
 * 备份读取报「这一段没读到」时，用它把 unavailable 对到 `BACKUP_STORES` 的条目。
 */
export const BACKUP_STORE_ID_BY_CONFIG_KEY: Readonly<Record<string, string>> = {
  categories: 'categories',
  fields: 'fields',
  templates: 'templates',
  infoGroups: 'infoGroups',
  bodyGroups: 'bodyGroups',
  folders: 'characterFolders',
  worldFolders: 'worldFolders',
  inspirations: 'inspirations',
}

/** 这次备份**实际没有包含**的 store / 素材（清单不能据此宣称完整） */
export interface BackupManifestIssue {
  /** 对应 `BACKUP_STORES` 的 id（或 `images`） */
  id: string
  label: string
  reason: string
}

/** 备份文件里的完整清单（给人看，也给恢复报告核对） */
export interface BackupManifest {
  version: number
  generatedAt: string
  /**
   * 是否完整：`false` 时 `unavailable` 一定非空，说明这次文件里**缺了**登记表
   * 声称应包含的 store / 素材。读不到不能假装读到，也不能只靠实体数量宣称完整。
   */
  complete: boolean
  unavailable: BackupManifestIssue[]
  /** 这一次**实际**打包的 store（登记为应包含、但本次读不到的不会出现在这里） */
  included: BackupStore[]
  /** 明确不打包的 store（含原因） */
  excluded: BackupStore[]
}

/** 打包时生成清单；`unavailable` 由调用方把读取失败 / 缺图等真实缺失传进来 */
export function buildBackupManifest(
  options: { unavailable?: readonly BackupManifestIssue[] } = {},
  now: Date = new Date(),
): BackupManifest {
  const unavailable = (options.unavailable ?? []).map((issue) => ({ ...issue }))
  const missingIds = new Set(unavailable.map((issue) => issue.id))
  const included = BACKUP_STORES.filter(
    (store) => store.disposition === 'included' && !missingIds.has(store.id),
  ).map(cloneStore)
  const excluded = BACKUP_STORES.filter((store) => store.disposition === 'excluded').map(cloneStore)
  return {
    version: BACKUP_MANIFEST_VERSION,
    generatedAt: now.toISOString(),
    complete: unavailable.length === 0,
    unavailable,
    included,
    excluded,
  }
}

/** 只读登记表：界面「包含 / 不包含」两段直接用这两个，别在界面里再手写一份 */
export function backupIncludeStores(): BackupStore[] {
  return BACKUP_STORES.filter((store) => store.disposition === 'included').map(cloneStore)
}

export function backupExcludeStores(): BackupStore[] {
  return BACKUP_STORES.filter((store) => store.disposition === 'excluded').map(cloneStore)
}

function cloneStore(store: BackupStore): BackupStore {
  return { ...store }
}
