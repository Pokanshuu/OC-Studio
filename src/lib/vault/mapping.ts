import { stripOrderPrefix } from './wikilink'
import type { VaultEntityKind, VaultFolderRule } from './types'

// ── 目录 → 实体类型 ──────────────────────────────────────────────────────
// 外来 vault 的目录命名千差万别（`20.角色`、`角色`、`Characters`），
// 因此不按目录全路径匹配，而是**逐段看目录名**：去掉 `NN.` 序号前缀后与关键词表比对，
// 最靠前的一段命中即生效，更深的层级继承它。

interface KeywordRule {
  keywords: string[]
  kind: VaultEntityKind
}

/** 关键词表。顺序即优先级：越靠前越专有。 */
const KEYWORD_RULES: KeywordRule[] = [
  { keywords: ['角色', '人物', '角色卡', 'oc', 'ocs', 'character', 'characters', 'people'], kind: 'character' },
  { keywords: ['国家', '势力', '地区', '政权', '城邦', 'country', 'countries', 'nation', 'nations'], kind: 'country' },
  { keywords: ['事件', '大事记', '编年', '年表', 'event', 'events', 'timeline', 'chronicle'], kind: 'event' },
  { keywords: ['标签', 'tag', 'tags'], kind: 'tag' },
  { keywords: ['时期', '纪元', '年代', 'period', 'periods', 'era', 'eras', 'epoch'], kind: 'period' },
  {
    keywords: [
      '世界观', '设定', '词条', '概念', '体系', '总纲', '地理', '历史', '文化', '组织', '物品', '生物',
      '魔法', '法术', '技术', '关系图', '图谱', '分析', '资料', '笔记', '草稿',
      // 阵营/派系：不进实体类型，落成词条（角色用 `阵营` 名字软引用它们）
      '阵营', '派系', '派别', '立场', 'faction', 'factions',
      'lore', 'world', 'worldbuilding', 'worldview', 'setting', 'settings', 'wiki', 'notes', 'note',
    ],
    kind: 'worldEntry',
  },
]

/** 目录分类结果 */
export interface FolderClassification {
  kind: VaultEntityKind
  /** worldEntry 使用的默认分类 */
  category: string
  /** 命中的关键词；未命中为 null（未映射，会被跳过并计入报告） */
  matched: string | null
  /** 展示/分类用的目录名（去序号前缀后的最后一段） */
  label: string
}

/** 取目录的展示名：去掉序号前缀后的**最后一段** */
function folderLabel(folder: string): string {
  if (folder === '') return ''
  const segments = folder.split('/')
  const last = segments[segments.length - 1]
  const { label } = stripOrderPrefix(last)
  return label
}

/**
 * 目录 → 实体类型。从最外层向内逐段匹配，首个命中生效；
 * 全部未命中则返回 kind='ignore'，该文件只进报告、不落库。
 */
export function classifyFolder(
  folder: string,
  rules: KeywordRule[] = KEYWORD_RULES,
): FolderClassification {
  const label = folderLabel(folder)
  if (folder === '') return { kind: 'ignore', category: '', matched: null, label }

  const segments = folder.split('/')
  for (const segment of segments) {
    const { label: name } = stripOrderPrefix(segment)
    const key = name.normalize('NFKC').trim().toLowerCase()
    if (key === '') continue
    for (const rule of rules) {
      if (rule.keywords.includes(key)) {
        return { kind: rule.kind, category: name, matched: name, label }
      }
    }
  }

  return { kind: 'ignore', category: '', matched: null, label }
}

/** 内置关键词表的可读形式（设置界面展示用） */
export function keywordRules(): { kind: VaultEntityKind; keywords: string[] }[] {
  return KEYWORD_RULES.map((rule) => ({ kind: rule.kind, keywords: [...rule.keywords] }))
}

/**
 * 用户自定义覆盖：把某目录强制指定为某类型。
 * 覆盖项优先于关键词表，供「Vault 映射」设置界面使用。
 */
export function classifyFolderWithOverrides(
  folder: string,
  overrides: VaultFolderRule[],
): FolderClassification {
  const normalized = folder.normalize('NFKC').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  // 先看覆盖项（前缀从长到短，最具体的优先）
  const sorted = [...overrides].sort((a, b) => b.prefix.length - a.prefix.length)
  for (const rule of sorted) {
    const prefix = rule.prefix.normalize('NFKC').replace(/^\/+|\/+$/g, '')
    if (prefix === '') continue
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      const label = folderLabel(normalized)
      return { kind: rule.kind, category: rule.category ?? label, matched: prefix, label }
    }
  }
  return classifyFolder(normalized)
}
