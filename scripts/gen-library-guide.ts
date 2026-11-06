/**
 * 从 TypeScript 类型生成「给助手的库手册」。
 *
 * 为什么要有这个脚本：`src/types/index.ts` 是实体字段的唯一真源，
 * 而助手看到的是一段自然语言提示词。类型一改、提示词不跟，模型就会按旧字段乱填。
 * 这里把四个接口连同 JSDoc 描述读出来，生成
 * `src/plugins/agent/host/library-model.generated.ts`；
 * 字段白名单 / 关系规则来自 `lib/capabilities/agent-tools.ts`，同一份源。
 *
 * 用法：
 *   npm run gen:library-guide      # 重新生成
 *   npm run audit:library-guide    # 只检查是否过期（CI / 提交前）
 *
 * 白名单里出现类型里不存在的字段会**直接报错**（改名了却忘了改白名单，
 * 模型调工具时才会被拒绝 —— 在这里先炸掉）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as ts from 'typescript'
import {
  KIND_LABEL,
  KINDS,
  LINKABLE,
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

/**
 * 不写进手册的字段。
 *
 * 只放「内部簿记 / 旧字段 / 派生值 / 视图状态」—— 内容字段一个都别加进来，
 * 否则新加的类型字段会悄悄从提示词里消失。
 */
const SKIP_FIELDS = new Set([
  // 内部簿记
  'id',
  'createdAt',
  'updatedAt',
  'deleted',
  '_syncStatus',
  '_lastModified',
  // 正文走 library_set_body；content 是词条旧正文
  'document',
  'content',
  'references',
  // 派生 / 视图状态
  'graphPosition',
  'mapPosition',
  'mapId',
  'factionId',
  // 旧字段
  'nationalityLegacy',
  'lifeStory',
  'legacyKind',
  // 结构位（不在标量写入白名单里，写进手册只会诱导模型乱试）
  'order',
  'isConcept',
  'custom',
])

interface FieldInfo {
  name: string
  type: string
  optional: boolean
  description: string
}

function interfaceFields(source: ts.SourceFile, checker: ts.TypeChecker, name: string): FieldInfo[] {
  const interfaceDecl = source.statements.find(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === name,
  )
  if (!interfaceDecl) throw new Error(`找不到接口 ${name}（src/types/index.ts）`)

  const type = checker.getTypeAtLocation(interfaceDecl)
  return type
    .getProperties()
    .filter((symbol) => !SKIP_FIELDS.has(symbol.name))
    .map((symbol) => {
      const fieldDecl = symbol.valueDeclaration ?? symbol.declarations?.[0] ?? interfaceDecl
      const valueType = checker.getTypeOfSymbolAtLocation(symbol, fieldDecl)
      const description = ts
        .displayPartsToString(symbol.getDocumentationComment(checker))
        .replace(/\s+/g, ' ')
        .trim()
      return {
        name: symbol.name,
        type: checker
          .typeToString(
            valueType,
            fieldDecl,
            ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
          )
          // `?` 已经表达了可选，别在提示词里再写一遍 `| undefined`
          .replace(/ \| undefined$/, ''),
        optional: (symbol.flags & ts.SymbolFlags.Optional) !== 0,
        // 提示词要短：JSDoc 里常有整段实现说明，截到一句为止
        description: description.length > 90 ? `${description.slice(0, 90)}…` : description,
      }
    })
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

  const sections: string[] = [
    '## 数据模型（由 `npm run gen:library-guide` 从 `src/types/index.ts` 生成）',
    '',
  ]

  for (const kind of KINDS) {
    const fields = interfaceFields(source, checker, INTERFACE_BY_KIND[kind])
    const names = new Set(fields.map((field) => field.name))
    for (const writable of WRITABLE_FIELDS[kind]) {
      if (!names.has(writable)) {
        throw new Error(
          `白名单字段 ${kind}.${writable} 在接口 ${INTERFACE_BY_KIND[kind]} 里不存在 —— 类型改名了，先改 agent-tools.ts 的 WRITABLE_FIELDS`,
        )
      }
    }

    sections.push(`### ${kind}（${KIND_LABEL[kind]}）`)
    for (const field of fields) {
      const signature = `${field.name}${field.optional ? '?' : ''}: ${field.type}`
      sections.push(`- \`${signature}\`${field.description ? ` ${field.description}` : ''}`)
    }
    const writable = WRITABLE_FIELDS[kind]
    sections.push(
      writable.length > 0
        ? `可写标量：${writable.map((key) => `\`${key}\``).join('、')}`
        : '可写标量：无（正文用 `library_set_body`）',
      '',
    )
  }

  sections.push('关系（`library_link`，只写发起方）：')
  for (const rule of LINKABLE) sections.push(`- ${rule}`)
  sections.push('')

  return sections.join('\n')
}

function renderFile(markdown: string): string {
  const escaped = markdown.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
  return `/**
 * AUTO-GENERATED — 不要手改。
 *
 * 来源：\`src/types/index.ts\` 的四个接口 + \`src/lib/capabilities/agent-tools.ts\`
 * 的字段白名单 / 关系规则。
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
      return readFileSync(OUT_PATH, 'utf8')
    } catch {
      return ''
    }
  })()

  if (check) {
    if (current === next) {
      console.log('库手册与类型一致。')
      return
    }
    console.error('库手册已过期：`src/types/index.ts` 或字段白名单改过。运行 `npm run gen:library-guide` 重新生成。')
    process.exitCode = 1
    return
  }

  if (current === next) {
    console.log('库手册已是最新。')
    return
  }
  writeFileSync(OUT_PATH, next)
  console.log(`已生成 ${OUT_PATH}`)
}

main()
