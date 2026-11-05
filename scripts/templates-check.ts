/**
 * 模板自检（`npm run audit:templates`）。
 *
 * 拦的是「模板与实现漂移」—— 配了没反应的组件、认不出的 id、重复 id、
 * 以及内置模板里漏了必填项。纯静态检查，不需要真实 vault。
 */
import { BUILTIN_TEMPLATES } from '../src/lib/templates/defaults'
import { COMPONENT_BY_ID, COMPONENT_IDS } from '../src/lib/templates/registry'
import { parseTemplate, serializeTemplate, unknownComponentIds } from '../src/lib/templates/serialize'
import { WIRED_BY_TEMPLATE, isComponentWired } from '../src/lib/templates/support'
import {
  TEMPLATE_PARAM_SCHEMA,
  TEMPLATE_PARAM_SUPPORT,
  validateTemplateParams,
} from '../src/lib/templates/params'
import { isNoteTemplate, NOTE_COMPONENT_IDS } from '../src/lib/templates/note'
import { templateFieldKeys } from '../src/lib/templates/fields'
import { BUILTIN_INFO_GROUPS, isBuiltinInfoGroup, selectableInfoGroups } from '../src/lib/templates/info-groups'
import { BUILTIN_FIELDS } from '../src/lib/fields/defaults'
import { BUILTIN_CATEGORIES } from '../src/lib/categories/builtins'
import type { TemplateDoc } from '../src/lib/templates/types'

let failures = 0
function check(ok: boolean, message: string): void {
  if (ok) return
  failures += 1
  console.error(`  ✗ ${message}`)
}

console.log('模板自检：')

// 1. 组件登记表本身
check(COMPONENT_IDS.length === new Set(COMPONENT_IDS).size, '组件登记表有重复 id')
for (const id of COMPONENT_IDS) {
  check(Boolean(COMPONENT_BY_ID[id]?.label), `组件 ${id} 缺 label`)
}

// 2. 内置模板
for (const doc of BUILTIN_TEMPLATES) {
  check(doc.id.trim() !== '', '内置模板缺 id')
  check(doc.name.trim() !== '', `模板 ${doc.id} 缺名称`)
  check(doc.components.length > 0, `模板 ${doc.id} 没有组件`)
  const ids = doc.components.map((component) => component.id)
  check(ids.length === new Set(ids).size, `模板 ${doc.id} 有重复组件`)
  const unknown = unknownComponentIds(doc)
  check(unknown.length === 0, `模板 ${doc.id} 有未登记组件：${unknown.join(', ')}`)
  check(
    doc.components.some((component) => component.id === 'body'),
    `模板 ${doc.id} 少了「正文」`,
  )
}

// 3. 往返：写出去再读回来，必须完全一致（模板文件是可分享的，不能丢参数）
for (const doc of BUILTIN_TEMPLATES) {
  const roundTrip = parseTemplate(serializeTemplate(doc), doc.id)
  check(roundTrip !== null, `模板 ${doc.id} 序列化后读不回来`)
  if (!roundTrip) continue
  check(roundTrip.id === doc.id, `模板 ${doc.id} 往返后 id 变了`)
  check(roundTrip.name === doc.name, `模板 ${doc.id} 往返后名称变了`)
  check(
    roundTrip.components.length === doc.components.length,
    `模板 ${doc.id} 往返后组件数变了（${roundTrip.components.length} ≠ ${doc.components.length}）`,
  )
  check(
    roundTrip.components.every((component, index) => component.id === doc.components[index]?.id),
    `模板 ${doc.id} 往返后组件顺序变了`,
  )
}

// 4. 手写容错：组件写成字符串数组也要能读
const loose = parseTemplate(
  ['---', 'id: custom-demo', '名称: 演示', '组件: [info, tags, body]', '---', '', '说明', ''].join('\n'),
  'custom-demo',
)
check(loose !== null, '字符串数组形式的组件读不出来')
check(loose?.components.length === 3, '字符串数组形式的组件数量不对')

// 5. 非法输入不崩
const broken: unknown[] = ['', '---\n名称: 无 id\n---', '---\nid: x\n---', 'not frontmatter']
for (const raw of broken) {
  const parsed = parseTemplate(String(raw), 'fallback')
  check(parsed === null || typeof parsed.name === 'string', `解析异常输入时返回了非法结构：${String(raw).slice(0, 24)}`)
}

// 6. 别名不重复并集冲突（同一旧名不能指向两个模板）
const seenAlias = new Map<string, string>()
for (const doc of BUILTIN_TEMPLATES) {
  for (const alias of doc.aliases) {
    const owner = seenAlias.get(alias)
    check(!owner || owner === doc.id, `别名「${alias}」同时属于 ${owner} 和 ${doc.id}`)
    seenAlias.set(alias, doc.id)
  }
}

// 7. 所有模板名唯一（笔记里存的是名字）
const seenName = new Set<string>()
for (const doc of BUILTIN_TEMPLATES as TemplateDoc[]) {
  check(!seenName.has(doc.name), `模板名重复：${doc.name}`)
  seenName.add(doc.name)
}

// 8. 接线登记（support.ts）必须只引用真实存在的组件，且必须属于该模板
for (const [templateId, ids] of Object.entries(WIRED_BY_TEMPLATE)) {
  check(
    BUILTIN_TEMPLATES.some((doc) => doc.id === templateId),
    `接线登记里有不存在的模板：${templateId}`,
  )
  const template = BUILTIN_TEMPLATES.find((doc) => doc.id === templateId)
  for (const id of ids) {
    check(COMPONENT_IDS.includes(id), `接线登记 ${templateId} 引用了未登记组件：${id}`)
    check(
      Boolean(template?.components.some((component) => component.id === id)),
      `接线登记 ${templateId} 里的 ${id} 不在该模板的组件清单里`,
    )
  }
}

// 9. 笔记类模板：分类条目只该看到能真渲染的模板
for (const id of ['entry', 'pet', 'weapon']) {
  const doc = BUILTIN_TEMPLATES.find((item) => item.id === id)
  check(doc !== undefined && isNoteTemplate(doc), `内置笔记模板 ${id} 不是可渲染的笔记模板`)
}
for (const id of ['character', 'event', 'country']) {
  const doc = BUILTIN_TEMPLATES.find((item) => item.id === id)
  check(doc !== undefined && !isNoteTemplate(doc), `实体模板 ${id} 不应出现在分类模板选择里`)
}

// 9b. 自建模板走笔记渲染路径：笔记组件必须算「已接线」，否则新建的模板
//     每个组件都显示「开发中」，连「基本信息」都选不了（用户实测踩到过）
for (const id of NOTE_COMPONENT_IDS) {
  check(COMPONENT_IDS.includes(id), `笔记组件登记里有未登记组件：${id}`)
  check(isComponentWired('custom-demo', id), `自建模板的 ${id} 不算已接线`)
}
for (const id of COMPONENT_IDS) {
  if (NOTE_COMPONENT_IDS.includes(id)) continue
  check(!isComponentWired('custom-demo', id), `自建模板的 ${id} 不该算已接线`)
}
for (const id of ['pet', 'weapon']) {
  const wired = WIRED_BY_TEMPLATE[id] ?? []
  check(
    NOTE_COMPONENT_IDS.every((component) => wired.includes(component)),
    `内置笔记模板 ${id} 的接线表与笔记组件不一致`,
  )
}

// 10. 模板字段（宠物 / 武器）必须能往返：YAML 数组 ⇄ string[]
for (const id of ['pet', 'weapon']) {
  const doc = BUILTIN_TEMPLATES.find((item) => item.id === id)
  check(doc !== undefined, `内置模板 ${id} 不存在`)
  if (!doc) continue
  const keys = templateFieldKeys(doc) ?? []
  check(keys.length > 0, `内置模板 ${id} 没有声明 fields`)
  check(new Set(keys).size === keys.length, `内置模板 ${id} 的 fields 有重复键`)
  const parsed = parseTemplate(serializeTemplate(doc), doc.id)
  check(
    parsed !== null && JSON.stringify(templateFieldKeys(parsed)) === JSON.stringify(keys),
    `内置模板 ${id} 往返后 fields 变了`,
  )
}

// 11. 内置分类：模板必须存在，且出厂状态是关闭的（宠物 / 武器默认不启用）
const seenCategoryId = new Set<string>()
const seenCategoryName = new Set<string>()
for (const category of BUILTIN_CATEGORIES) {
  check(category.builtin === true, `内置分类 ${category.name} 缺 builtin 标记`)
  check(category.enabled === false, `内置分类 ${category.name} 出厂应为未启用`)
  check(!seenCategoryId.has(category.id), `内置分类 id 重复：${category.id}`)
  check(!seenCategoryName.has(category.name), `内置分类名重复：${category.name}`)
  seenCategoryId.add(category.id)
  seenCategoryName.add(category.name)
  check(
    BUILTIN_TEMPLATES.some((doc) => doc.id === category.template),
    `内置分类 ${category.name} 绑定了不存在的模板：${category.template}`,
  )
}

// 12. 组件参数契约：登记的参数必须属于真实组件，消费方模板必须存在；内置模板不能带未登记参数
for (const [componentId, defs] of Object.entries(TEMPLATE_PARAM_SCHEMA)) {
  check(COMPONENT_IDS.includes(componentId as (typeof COMPONENT_IDS)[number]), `参数契约引用了未登记组件：${componentId}`)
  const keys = defs?.map((def) => def.key) ?? []
  check(keys.length === new Set(keys).size, `组件 ${componentId} 的参数键重复`)
  for (const def of defs ?? []) {
    // 值域是用户数据的参数（组件 id / 旧字段表）没有静态选项
    if (def.kind !== 'choice') continue
    check(def.options.length > 0, `参数 ${componentId}.${def.key} 没有可选值`)
    check(
      def.options.some((option) => option.value === def.fallback),
      `参数 ${componentId}.${def.key} 的默认值不在选项里`,
    )
  }
}
for (const [componentId, templates] of Object.entries(TEMPLATE_PARAM_SUPPORT)) {
  for (const templateId of templates ?? []) {
    const template = BUILTIN_TEMPLATES.find((doc) => doc.id === templateId)
    check(Boolean(template), `参数消费登记里有不存在的模板：${templateId}`)
    check(
      Boolean(template?.components.some((component) => component.id === componentId)),
      `参数消费登记 ${templateId} 没有组件 ${componentId}`,
    )
    check(
      WIRED_BY_TEMPLATE[templateId]?.includes(componentId as (typeof COMPONENT_IDS)[number]) ?? false,
      `参数消费登记 ${templateId}.${componentId} 没有出现在接线表里`,
    )
  }
}
for (const doc of BUILTIN_TEMPLATES) {
  const errors = validateTemplateParams(doc)
  check(errors.length === 0, `模板 ${doc.id} 参数校验失败：${errors.join('；')}`)
}

// 13. 参数必须能写进模板文件再读回来（YAML 嵌套对象，不能丢）
const withParams: TemplateDoc = {
  id: 'character',
  name: '参数往返',
  aliases: [],
  components: [
    { id: 'relations', enabled: true, params: { presentation: 'compact', title: false } },
    { id: 'gallery', enabled: true, params: { mode: 'slider', columns: 3 } },
    { id: 'body', enabled: true },
  ],
}
const paramRoundTrip = parseTemplate(serializeTemplate(withParams), 'character')
check(paramRoundTrip !== null, '带参数的模板序列化后读不回来')
check(
  JSON.stringify(paramRoundTrip?.components) === JSON.stringify(withParams.components),
  '带参数的模板往返后 params 变了',
)
check(validateTemplateParams(withParams).length === 0, '合法参数被校验器判错')

/* ── 内置基本信息组件：字段必须真能显示 ─────────────────────────────── */

const COLUMN_HOSTS: Record<string, 'character' | 'event' | 'worldEntry'> = {
  character: 'character',
  event: 'event',
  world: 'worldEntry',
}

for (const group of BUILTIN_INFO_GROUPS) {
  check(group.for !== undefined, `内置组件「${group.name}」没标宿主`)
  check(group.fields.length > 0, `内置组件「${group.name}」没有出厂字段`)
  const columnKind = group.for !== undefined ? COLUMN_HOSTS[group.for] : undefined
  if (columnKind === undefined) continue
  const known = new Set(BUILTIN_FIELDS[columnKind].map((field) => field.id))
  for (const key of group.fields) {
    check(known.has(key), `内置组件「${group.name}」的字段 ${key} 不在 ${columnKind} 的字段表里`)
  }
}

// 内置组件必须被 isBuiltinInfoGroup 认出来（否则界面允许删掉它，下次读盘又回来）
for (const group of BUILTIN_INFO_GROUPS) {
  check(isBuiltinInfoGroup(group.id), `内置组件「${group.name}」没被 isBuiltinInfoGroup 覆盖`)
}

// 选择器过滤：角色模板不能选到宠物组件
const petGroup = BUILTIN_INFO_GROUPS.find((group) => group.id === 'group-pet')
if (petGroup) {
  const forCharacter = selectableInfoGroups('character', BUILTIN_INFO_GROUPS)
  check(!forCharacter.includes(petGroup), '角色模板仍能选到宠物组件')
  const forPet = selectableInfoGroups('pet', BUILTIN_INFO_GROUPS)
  check(forPet.includes(petGroup), '宠物模板选不到宠物组件')
}
if (failures === 0) {
  console.log(`  ✓ 通过（${COMPONENT_IDS.length} 个组件 / ${BUILTIN_TEMPLATES.length} 个内置模板）`)
  process.exit(0)
}
console.error(`\n${failures} 项未通过`)
process.exit(1)
