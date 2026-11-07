/**
 * 模板自检（`npm run audit:templates`）。
 *
 * 拦的是「模板与实现漂移」—— 配了没反应的组件、认不出的 id、重复 id、
 * 以及内置模板里漏了必填项。纯静态检查，不需要真实 vault。
 */
import { BUILTIN_TEMPLATES } from '../src/lib/templates/defaults'
import { COMPONENT_BY_ID, COMPONENT_IDS } from '../src/lib/templates/registry'
import { parseTemplate, serializeTemplate, unknownComponentIds } from '../src/lib/templates/serialize'
import { WIRED_BY_TEMPLATE, availableComponents, isComponentAvailable, isComponentWired } from '../src/lib/templates/support'
import {
  TEMPLATE_PARAM_SCHEMA,
  TEMPLATE_PARAM_SUPPORT,
  TEMPLATE_PARAM_ANY_NOTE,
  inlineParamDefs,
  validateTemplateParams,
} from '../src/lib/templates/params'
import { COUNTRY_KEYS, EVENT_KEYS, WORLD_KEYS, CHARACTER_KEYS } from '../src/lib/vault/fields'
import { isNoteTemplate, NOTE_COMPONENT_IDS } from '../src/lib/templates/note'
import { bodyPresetFromDoc } from '../src/lib/templates/body-preset'
import { bodyDocFromMarkdown } from '../src/lib/vault/write-body'
import { templateFieldKeys, templateFieldLabels, templateFieldTypes } from '../src/lib/templates/fields'
import {
  BUILTIN_INFO_GROUPS,
  infoFieldLabelOf,
  infoFieldTypeOf,
  isBuiltinInfoGroup,
  normalizeInfoGroups,
  selectableInfoGroups,
} from '../src/lib/templates/info-groups'
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

// 9. 笔记渲染路径：十一个组件都实装后，**任何含正文的模板**都能绑到分类
for (const doc of BUILTIN_TEMPLATES) {
  check(isNoteTemplate(doc), `内置模板 ${doc.id} 不是可渲染的笔记模板`)
}
for (const id of NOTE_COMPONENT_IDS) {
  check(COMPONENT_IDS.includes(id), `笔记组件登记里有未登记组件：${id}`)
}
// 笔记组件闭集必须与组件登记表一致：少一个，那个组件在自建模板上就会显示「开发中」
check(
  NOTE_COMPONENT_IDS.length === COMPONENT_IDS.length,
  `笔记组件闭集少登记了组件：${COMPONENT_IDS.filter((id) => !NOTE_COMPONENT_IDS.includes(id)).join(', ')}`,
)

// 9b. 自建模板走笔记渲染路径：笔记组件必须算「已接线」，否则新建的模板
//     每个组件都显示「开发中」，连「基本信息」都选不了（用户实测踩到过）
for (const id of NOTE_COMPONENT_IDS) {
  check(isComponentWired('custom-demo', id), `自建模板的 ${id} 不算已接线`)
}
for (const id of ['entry', 'pet', 'weapon']) {
  check(
    NOTE_COMPONENT_IDS.every((component) => isComponentWired(id, component)),
    `内置笔记模板 ${id} 的接线表与笔记组件不一致`,
  )
}

// 9c. 「添加组件」只列宿主真存得住的组件：实体模板不能出现它没有的列
for (const [templateId, ids] of Object.entries(WIRED_BY_TEMPLATE)) {
  const template = BUILTIN_TEMPLATES.find((doc) => doc.id === templateId)
  for (const id of ids) {
    check(COMPONENT_IDS.includes(id), `宿主表 ${templateId} 引用了未登记组件：${id}`)
    check(
      Boolean(template?.components.some((component) => component.id === id)),
      `宿主表 ${templateId} 的 ${id} 不在默认模板里（默认模板不该带宿主存不住的组件）`,
    )
  }
}
for (const doc of BUILTIN_TEMPLATES) {
  if (WIRED_BY_TEMPLATE[doc.id] !== undefined) continue
  for (const component of doc.components) {
    check(
      isComponentAvailable(doc.id, component.id),
      `笔记模板 ${doc.id} 的默认组件 ${component.id} 不在可用列表里`,
    )
  }
}
check(
  availableComponents('custom-demo').length === COMPONENT_IDS.length,
  '自建模板的可用组件必须是全部组件',
)

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
      isComponentWired(templateId, componentId as (typeof COMPONENT_IDS)[number]),
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

// 13b. 正文预设：Markdown 多行 + [[链接]] 必须原样往返，且只对含正文的模板开放
const presetMarkdown = ['## 人物简介', '', '写三句话。', '', '- 出生地', '- 年龄', '', '相关：[[主角]]'].join('\n')
const withPreset: TemplateDoc = {
  id: 'character',
  name: '正文预设往返',
  aliases: [],
  components: [{ id: 'body', enabled: true, params: { preset: presetMarkdown } }],
}
const presetRoundTrip = parseTemplate(serializeTemplate(withPreset), 'character')
check(
  presetRoundTrip?.components[0]?.params?.preset === presetMarkdown,
  '正文预设的 Markdown 往返后变了',
)
check(validateTemplateParams(withPreset).length === 0, '合法的正文预被判错')
const numericPreset: TemplateDoc = {
  ...withPreset,
  components: [{ id: 'body', enabled: true, params: { preset: 42 } }],
}
check(validateTemplateParams(numericPreset).length > 0, '正文预设接受非文本值')
check(
  inlineParamDefs('body').length === 0,
  '正文预设不该出现在编排行内（它是独立配置面）',
)
// 13c. 预设 Markdown ⇄ 编辑器文档 必须逐字往返（含指向还没建的条目的 [[ ]]
const presetDoc = bodyDocFromMarkdown(presetMarkdown, { unresolvedLinks: 'keep' })
check(bodyPresetFromDoc(presetDoc) === presetMarkdown, '正文预设的 Markdown ⇄ 文档 往返变了')
// 写正文（助手写章节）时的口径不变：未建链接降级成纯文本，方括号消失
const droppedDoc = bodyDocFromMarkdown('相关：[[主角]]')
check(!bodyPresetFromDoc(droppedDoc).includes('[['), '写正文时未建链接仍该降级成纯文本')


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
// 盘上改不了内置组件的宿主，也塞不进不存在的列键
const tampered = normalizeInfoGroups([
  { id: 'group-character', name: '角色', fields: ['race', '并不存在的键'], for: 'note' },
])
const tamperedGroup = tampered.find((group) => group.id === 'group-character')
check(tamperedGroup?.for === 'character', '盘上的 for 改写了内置组件的宿主')
check(
  tamperedGroup !== undefined && !tamperedGroup.fields.includes('并不存在的键'),
  '不存在的列键被读回进内置组件（界面上会出现死行）',
)
// 列型宿主的字段顺序与范围归 FieldConfig（字段表编辑器）；盘上的值不作数
const reordered = normalizeInfoGroups([
  { id: 'group-character', name: '角色', fields: ['birthday'] },
]).find((group) => group.id === 'group-character')
const characterDefaults = BUILTIN_INFO_GROUPS.find((group) => group.id === 'group-character')
check(
  reordered !== undefined &&
    characterDefaults !== undefined &&
    reordered.fields.join(',') === characterDefaults.fields.join(','),
  '列型宿主的字段没有按 FieldConfig 投影（盘上的值越权了）',
)
/* ── 字段类型：只有笔记型组件有，且必须是四种之一（没有「多行」）────────── */

const petBuiltin = BUILTIN_INFO_GROUPS.find((group) => group.id === 'group-pet')
check(petBuiltin?.types?.['出生日期'] === 'date', '内置宠物组件的出生日期不是日期类型')
check(
  petBuiltin !== undefined && !petBuiltin.fields.includes('外观特征'),
  '内置宠物组件还留着长文字段（那几段归正文）',
)
check(infoFieldTypeOf(petBuiltin, '品种') === 'text', '没设类型的字段没有回落到单行')
check(infoFieldTypeOf(undefined, 'x') === 'text', '组件不存在时类型访问炸了')

const typedSaved = normalizeInfoGroups([
  {
    id: 'group-pet',
    name: '宠物',
    fields: ['年龄', '性格', '退役'],
    types: { 年龄: 'number', 性格: 'boolean', 退役: 'longtext', 不存在的键: 'date', 性格2: '看不懂' },
  },
]).find((group) => group.id === 'group-pet')
check(typedSaved?.types?.['年龄'] === 'number', '笔记型组件的字段类型没存住')
check(typedSaved?.types?.['性格'] === 'boolean', '笔记型组件的第二个字段类型丢了')
check(typedSaved !== undefined && !('不存在的键' in (typedSaved.types ?? {})), '已删除字段的类型仍留在盘上')
check(typedSaved !== undefined && !('性格2' in (typedSaved.types ?? {})), '不认识的类型被读回来了')
check(
  typedSaved !== undefined && !('退役' in (typedSaved.types ?? {})),
  '已退役的「多行」类型被读回来了（应当回落单行）',
)

// 列型宿主：控件归字段表，组件里写的类型不作数
const columnTyped = normalizeInfoGroups([
  { id: 'group-character', name: '角色', fields: ['race'], types: { race: 'number' } },
]).find((group) => group.id === 'group-character')
check(columnTyped?.types === undefined, '列型宿主从盘上读到了字段类型（控件会有两个源）')

// 模板侧：读得到笔记型组件的类型，列型宿主一律 undefined
const petDoc: TemplateDoc = {
  id: 'pet',
  name: '宠物',
  aliases: [],
  components: [{ id: 'info', enabled: true, params: { group: 'group-pet' } }],
}
check(templateFieldTypes(petDoc, BUILTIN_INFO_GROUPS)?.['出生日期'] === 'date', '模板读不到选中组件的字段类型')
const characterDoc: TemplateDoc = {
  id: 'character',
  name: '角色',
  aliases: [],
  components: [{ id: 'info', enabled: true, params: { group: 'group-character' } }],
}
check(templateFieldTypes(characterDoc, BUILTIN_INFO_GROUPS) === undefined, '列型模板读到了组件里的字段类型')
check(templateFieldTypes({ ...petDoc, components: [{ id: 'info', enabled: true }] }, BUILTIN_INFO_GROUPS) === undefined, '没选组件的模板读到了类型')

/* ── 显示名：键是落盘用的，名字是给人看的 ─────────────────────────── */

const labeledSaved = normalizeInfoGroups([
  {
    id: 'group-pet',
    name: '宠物',
    fields: ['物种', '年龄'],
    labels: { 物种: '生物类别', 年龄: '   ', 不存在的键: '幽灵' },
  },
]).find((group) => group.id === 'group-pet')
check(labeledSaved?.labels?.['物种'] === '生物类别', '字段显示名没存住')
check(labeledSaved !== undefined && !('年龄' in (labeledSaved.labels ?? {})), '空白显示名被当成有效值')
check(labeledSaved !== undefined && !('不存在的键' in (labeledSaved.labels ?? {})), '已删除字段的显示名仍留在盘上')
check(infoFieldLabelOf(labeledSaved, '物种') === '生物类别', '读取显示名时没用盘上的值')
check(infoFieldLabelOf(labeledSaved, '年龄') === '年龄', '没设显示名的字段没有回落到键名')

const sameName = normalizeInfoGroups([
  { id: 'group-pet', name: '宠物', fields: ['物种'], labels: { 物种: '物种' } },
]).find((group) => group.id === 'group-pet')
check(sameName?.labels === undefined, '显示名与键名相同时也被存下来了')

const columnLabeled = normalizeInfoGroups([
  { id: 'group-character', name: '角色', fields: ['race'], labels: { race: '种族' } },
]).find((group) => group.id === 'group-character')
check(columnLabeled?.labels === undefined, '列型宿主从盘上读到了显示名（显示名有两个源）')

const labeledDoc: TemplateDoc = {
  id: 'pet',
  name: '宠物',
  aliases: [],
  components: [{ id: 'info', enabled: true, params: { group: 'group-pet' } }],
}
check(
  templateFieldLabels(labeledDoc, normalizeInfoGroups([
    { id: 'group-pet', name: '宠物', fields: ['物种'], labels: { 物种: '生物类别' } },
  ]))?.['物种'] === '生物类别',
  '模板读不到选中组件的字段显示名',
)
check(templateFieldLabels(characterDoc, BUILTIN_INFO_GROUPS) === undefined, '列型模板读到了组件里的显示名')

/* ── 组件的落盘槽位必须都在 frontmatter 词汇表里 ─────────────────────── */

const WORLD_SLOT_KEYS = ['avatar', 'image', 'gallery', 'time', 'endTime', 'location'] as const
for (const key of WORLD_SLOT_KEYS) {
  check(
    key in WORLD_KEYS,
    `笔记宿主的组件槽位 ${key} 不在 WORLD_KEYS 里（写不回去 / 读不回来）`,
  )
}
check('gallery' in COUNTRY_KEYS, '国家的画廊槽位不在 COUNTRY_KEYS 里')
check('images' in EVENT_KEYS, '事件的画廊槽位不在 EVENT_KEYS 里')
for (const key of ['avatar', 'gallery', 'bio'] as const) {
  check(key in CHARACTER_KEYS, `角色的组件槽位 ${key} 不在 CHARACTER_KEYS 里`)
}
// 单图 / 画廊 / 时间 / 地点 / 简介 / 关系的呈现参数都必须登记，否则模板里配了没人读
for (const id of ['image', 'gallery', 'time', 'place', 'summary', 'relations'] as const) {
  check((TEMPLATE_PARAM_SCHEMA[id]?.length ?? 0) > 0, `组件 ${id} 没有登记参数契约`)
  check(TEMPLATE_PARAM_ANY_NOTE[id] === true, `组件 ${id} 没有对笔记模板开放参数`)
}

if (failures === 0) {
  console.log(`  ✓ 通过（${COMPONENT_IDS.length} 个组件 / ${BUILTIN_TEMPLATES.length} 个内置模板）`)
  process.exit(0)
}
console.error(`\n${failures} 项未通过`)
process.exit(1)
