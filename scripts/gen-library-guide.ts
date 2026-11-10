/**
 * 从**能力层**生成「给助手的库手册」。
 *
 * 上一版是从 `src/types/index.ts` 做类型转储：每类列全字段 + JSDoc，
 * 一次 3.5k 字符（≈1.2k tokens），而且把「界面内部字段」也交给了模型
 * （`parentId` / `gallery` / `map*`），模型只能在里面猜哪些能写。
 *
 * 这一版只输出**能力卡片**：每类写什么、图有哪些槽位、关系能连谁、哪些界面维护。
 * 来源是 `lib/capabilities/agent-tools.ts` 的白名单 / 槽位 / 关系规则 —— 工具面与
 * 能力面是同一份源，所以「广告即承诺」可以在这里直接审计：
 *
 *   类型里的每一列，要么有工具读写（白名单 / 槽位 / 改名 / 正文 / 标签 / 关系），
 *   要么在 `UI_ONLY_FIELDS` 写明由谁维护；两边都没有就直接失败。
 *
 * 用法：
 *   npm run gen:library-guide      # 重新生成
 *   npm run audit:library-guide    # 只检查是否过期（CI / 提交前）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as ts from 'typescript'
import {
  BODY_FIELDS,
  CUSTOM_FIELD,
  INTERNAL_FIELDS,
  KIND_LABEL,
  KINDS,
  LINKABLE,
  LINK_FIELDS,
  MEDIA_FIELD,
  NOVEL_FIELDS,
  RENAME_FIELDS,
  UI_ONLY_FIELDS,
  WRITABLE_FIELDS,
} from '../src/lib/capabilities/agent-tools'

const ROOT = process.cwd()
const TYPES_PATH = resolve(ROOT, 'src/types/index.ts')
const OUT_PATH = resolve(ROOT, 'src/plugins/agent/host/library-model.generated.ts')

/** kind → 类型接口名（与 `src/types/index.ts` 对齐） */
const INTERFACE_BY_KIND: Record<(typeof KINDS)[number], string> = {
  character: 'Character',
  event: 'Event',
  country: 'Country',
  world: 'WorldEntry',
}

interface FieldInfo {
  name: string
}

/** 只取字段名：卡片不再需要类型签名与 JSDoc */
function interfaceFields(source: ts.SourceFile, checker: ts.TypeChecker, name: string): FieldInfo[] {
  const interfaceDecl = source.statements.find(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === name,
  )
  if (!interfaceDecl) throw new Error(`找不到接口 ${name}（src/types/index.ts）`)

  return checker
    .getTypeAtLocation(interfaceDecl)
    .getProperties()
    .map((symbol) => ({ name: symbol.name }))
}

type Coverage = 'write' | 'media' | 'rename' | 'body' | 'tags' | 'link' | 'novel' | 'custom' | 'ui'

/** 这一列归谁管；`null` = 没有归属，审计失败 */
function coverageOf(kind: (typeof KINDS)[number], field: string): Coverage | null {
  if (INTERNAL_FIELDS.has(field)) return 'custom' // 由调用方先排除
  if (field === CUSTOM_FIELD) return 'custom'
  if ((WRITABLE_FIELDS[kind] as readonly string[]).includes(field)) return 'write'
  if (Object.values(MEDIA_FIELD[kind]).includes(field)) return 'media'
  if ((RENAME_FIELDS as readonly string[]).includes(field)) return 'rename'
  if ((BODY_FIELDS as readonly string[]).includes(field)) return 'body'
  if (field === 'tags') return 'tags'
  if ((LINK_FIELDS as readonly string[]).includes(field)) return 'link'
  if (kind === 'world' && (NOVEL_FIELDS as readonly string[]).includes(field)) return 'novel'
  if (UI_ONLY_FIELDS[kind][field]) return 'ui'
  return null
}

/** 「广告即承诺」：类型字段必须有归属；UI 豁免表也不能收编工具已经负责的列 */
function auditCoverage(fields: Record<(typeof KINDS)[number], FieldInfo[]>): void {
  for (const kind of KINDS) {
    const names = new Set(fields[kind].map((field) => field.name))
    for (const field of names) {
      if (INTERNAL_FIELDS.has(field)) continue
      if (coverageOf(kind, field) === null) {
        throw new Error(
          `字段 ${kind}.${field} 没有归属：要么进 WRITABLE_FIELDS / MEDIA_FIELD，` +
            `要么在 agent-tools.ts 的 UI_ONLY_FIELDS 写清「界面维护」。`,
        )
      }
    }
    for (const field of Object.keys(UI_ONLY_FIELDS[kind])) {
      if (!names.has(field)) {
        throw new Error(`UI_ONLY_FIELDS 里的 ${kind}.${field} 在类型里不存在（改名了？）`)
      }
      if (coverageOf(kind, field) !== 'ui') {
        throw new Error(`UI_ONLY_FIELDS 里的 ${kind}.${field} 与工具白名单重叠（广告与承诺矛盾）`)
      }
    }
  }
}

/** 卡片里值得点名的「界面维护」列；没必要把所有内部字段都倒出来 */
const UI_NOTE: Record<(typeof KINDS)[number], string> = {
  character: '动画 / 角色文件夹 / 图集 / 立绘 / 主要角色标记由界面维护',
  event: '`parentEventId` 是死列（事件没有层级，不要写）；事件关系 / 图集 / 关键标记由界面维护',
  country: '`parentId` 只能从表格页「新增子项」建，工具不读也不写；图集由界面维护',
  world: '归类 / 模板 / 父级用 `library_set_placement`；图集 / 地图字段由界面维护；`relations` 只读',
}

function cardFor(kind: (typeof KINDS)[number]): string[] {
  const writable = WRITABLE_FIELDS[kind]
  const media = Object.keys(MEDIA_FIELD[kind])
  const links = LINKABLE.filter((rule) => rule.startsWith(`${kind}→`)).map((rule) =>
    rule.replace(/（.*$/, '').replace('→', '→'),
  )
  const lines = [`### ${KIND_LABEL[kind]}（${kind}）`]
  lines.push(`可写：${writable.length > 0 ? writable.join(' / ') : '无（正文用 library_set_body）'}`)
  if (media.length > 0) lines.push(`图：${media.join(' / ')}`)
  if (links.length > 0) lines.push(`关系：${links.join(' / ')}`)
  lines.push(`界面维护：${UI_NOTE[kind]}`)
  return lines
}

function buildMarkdown(): string {
  const program = ts.createProgram([TYPES_PATH], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  })
  const source = program.getSourceFile(TYPES_PATH)
  if (!source) throw new Error(`读不到 ${TYPES_PATH}`)
  const checker = program.getTypeChecker()

  const fields = {} as Record<(typeof KINDS)[number], FieldInfo[]>
  for (const kind of KINDS) fields[kind] = interfaceFields(source, checker, INTERFACE_BY_KIND[kind])
  auditCoverage(fields)

  const sections: string[] = [
    '## 能力卡片（由 `npm run gen:library-guide` 从能力层生成）',
    '',
    '工具能读写的就是下面这些；没列到的列由界面维护，不要试。',
    '',
  ]
  for (const kind of KINDS) sections.push(...cardFor(kind), '')

  sections.push('## 通用规则')
  sections.push('- 自建字段只写这条**已有**的键或模板声明过的键（`library_read` 会列出）；真·新键才要 `create_new: true`')
  sections.push('- 正文 = `library_set_body`（整篇覆盖，先读再写）；改名 / 别名 = `library_rename`；标签 = `library_set_tags`')
  sections.push('- 新建前先 `library_search` 查重：同名条目会直接返回既有 id，不会再建一条')
  sections.push('- **id 只在当前库里有效**：每次先 `library_search` / `library_list` 取当前 id，不要复用上一轮的 id')
  sections.push('- 时间 / 生日只收数字年月日（`1203` / `1203-04` / `1203-04-15`，负年份前加 -）；纪年名 / 月名写正文或自建字段')
  sections.push('- 在线图片只认**图片直链**（搜索页常被 403 挡）；库里已有的图用 `path`')
  sections.push('- 写完看**回执**（路径 / 改动键 / 版本），不需要再读一遍文件或翻 journal')
  sections.push('- 不要手写 frontmatter 或直接改 `.md`：落盘键名与工具字段名不是一套，手改必错')
  sections.push('')

  return sections.join('\n')
}

function renderFile(markdown: string): string {
  const escaped = markdown.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
  return `/**
 * AUTO-GENERATED — 不要手改。
 *
 * 来源：\`src/lib/capabilities/agent-tools.ts\` 的字段白名单 / 图片槽位 / 关系规则 /
 * 界面维护豁免表；字段覆盖由 \`scripts/gen-library-guide.ts\` 对着
 * \`src/types/index.ts\` 审计（没有归属就失败）。
 * 重新生成：\`npm run gen:library-guide\`；漂移检查：\`npm run audit:library-guide\`。
 */
export const LIBRARY_MODEL_MARKDOWN = \`${escaped}\`
`
}

function main(): void {
  const next = renderFile(buildMarkdown())
  const check = process.argv.includes('--check')
  const current = (() => {
    try {
      // Windows 检出是 CRLF；比较前统一，否则每次新克隆都会误报「过期」
      return readFileSync(OUT_PATH, 'utf8').replace(/\r\n/g, '\n')
    } catch {
      return ''
    }
  })()

  if (check) {
    if (current === next) {
      console.log('能力卡片与能力层一致。')
      return
    }
    console.error('能力卡片已过期：字段白名单 / 槽位 / 界面维护表改过。运行 `npm run gen:library-guide` 重新生成。')
    process.exitCode = 1
    return
  }

  if (current === next) {
    console.log('能力卡片已是最新。')
    return
  }
  writeFileSync(OUT_PATH, next)
  console.log(`已生成 ${OUT_PATH}（${next.length} 字符）`)
}

main()
