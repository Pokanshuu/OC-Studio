/**
 * 宿主侧接线：把能力层的执行器交给插件。
 *
 * 这里**故意用动态 import**：`createDexieCapabilityStore()` 会拉起 Dexie，而
 * Next 在构建期也会 import 这个模块 —— 顶层的 Dexie 在 Node 里没有 IndexedDB，
 * 会当场炸。改成用到时才装载，构建期与 SSR 都不会碰它。
 *
 * 插件那边只认 `(name, args)` 这个签名，不知道背后是 Dexie、是 MCP 还是别的
 * （`docs/Agent接入.md` §传输层）。换实现只改这一个文件。
 */
import {
  createLibraryToolExecutor,
  LIBRARY_TOOL_NAMES,
  type LibraryCatalog,
  type LibraryWriter,
  type MediaSlot,
} from '@/lib/capabilities/agent-tools'
import type { EntityKind } from '@/lib/capabilities/types'
import type { Category } from '@/lib/categories/types'
import type { TemplateDoc } from '@/lib/templates/types'
import { TOOL_NAMES } from '@/plugins/agent/core/agent/tools'
import { hasPermission, isPluginActive } from '@/lib/plugins'
import { AGENT_PLUGIN } from '@/lib/plugins/official'

type Executor = ReturnType<typeof createLibraryToolExecutor>

/**
 * 读库跟着**插件启用状态**走：助手关掉时，这些工具不发给模型。
 * 关掉时：
 * - `isLibraryTool` 让调用方把这些工具从本轮请求里摘掉（模型看不到 = 不会去调）
 * - `resolveLibraryTool` 仍然兜底回一句可读错误（万一历史上已经把工具名发出去）
 *
 * 闸放在宿主这一侧，而不是插件设置里 —— 插件自带的工具开关是“我想让它用哪些”，
 * 宿主判的是“它现在能不能看见库”，两者不能互相顶替。
 */
export function libraryAccessGranted(): boolean {
  return isPluginActive(AGENT_PLUGIN) && hasPermission(AGENT_PLUGIN, 'read-entities')
}

export function isLibraryTool(name: string): boolean {
  return (LIBRARY_TOOL_NAMES as readonly string[]).includes(name)
}

/** 后来新增的库工具：旧安装的 `enabledTools` 是存下来的完整数组，不会自动出现 */
const NEW_LIBRARY_TOOLS = [
  'library_delete',
  'library_set_tags',
  'library_set_media',
  'library_rename',
  'library_set_placement',
  'library_create_category',
  'library_set_novel',
  'library_templates',
] as const

/**
 * 把新增的库工具补进旧设置。
 *
 * 只在「除新增工具外其余全开」时补 —— 用户手动关过任何工具的保持原样，
 * 不能借升级把他的选择又打开。
 */
export function addNewLibraryTools(enabled: string[]): string[] {
  const missing = NEW_LIBRARY_TOOLS.filter((name) => !enabled.includes(name))
  if (missing.length === 0) return enabled
  const previous = TOOL_NAMES.filter((name) => !(NEW_LIBRARY_TOOLS as readonly string[]).includes(name))
  return previous.every((name) => enabled.includes(name)) ? [...enabled, ...missing] : enabled
}

const TABLE_BY_KIND: Record<EntityKind, string> = {
  character: 'characters',
  event: 'events',
  country: 'countries',
  world: 'worldEntries',
}

/** 图片槽位 → 落库列名（世界词条的 cover/avatar/image 就是同名列） */
const MEDIA_COLUMN: Record<EntityKind, Partial<Record<MediaSlot, string>>> = {
  character: { avatar: 'avatarUrl', header: 'headerUrl' },
  event: { header: 'headerUrl' },
  country: { flag: 'flagUrl', header: 'headerUrl' },
  world: { cover: 'cover', avatar: 'avatar', image: 'image', novelCover: 'novelCover' },
}

/** 库内相对路径校验：不能绝对、不能 `..`，文件必须真的在库里 */
async function normalizeVaultPath(path: string): Promise<string> {
  const normalized = path.replace(/\\/g, '/')
  if (/^[a-zA-Z]:|^\//.test(normalized) || normalized.split('/').includes('..')) {
    throw new Error('path 必须是库内相对路径')
  }
  const [{ getVaultSession }, { vaultFs }] = await Promise.all([
    import('@/lib/vault/vault-session'),
    import('@/lib/vault/vault-fs'),
  ])
  const session = getVaultSession()
  if (session && !(await vaultFs.exists(session.root, normalized))) {
    throw new Error(`库里找不到这个文件：${normalized}`)
  }
  return normalized
}

/** 把图片路径写进实体的槽位列（setMedia / importImage 共用） */
async function writeMedia(kind: EntityKind, id: number, slot: MediaSlot, path: string): Promise<void> {
  const column = MEDIA_COLUMN[kind][slot]
  if (!column) throw new Error(`这个类型没有 ${slot} 槽位`)
  const normalized = await normalizeVaultPath(path)
  const { db, runAsActorAsync } = await loadWriteDeps()
  await runAsActorAsync('agent:assistant', async () => {
    await db.table(TABLE_BY_KIND[kind]).update(id, {
      [column]: normalized,
      updatedAt: Date.now(),
    })
  })
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif)$/i

/** 从 URL / 显式文件名得到一个安全的 `附件/<名字>` 路径 */
function imageFileName(url: string, filename?: string): string {
  let base = filename?.trim() ?? ''
  if (base === '') {
    try {
      base = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '')
    } catch {
      base = ''
    }
  }
  base = base
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  if (base === '') base = 'image'
  if (!IMAGE_EXT.test(base)) {
    if (/\.[a-z0-9]{2,5}$/i.test(base)) {
      throw new Error('图片扩展名只支持 png / jpg / jpeg / webp / gif / avif')
    }
    base = `${base}.png`
  }
  return `附件/${base}`
}

/**
 * 写库的落点：直接对 Dexie 表 `update`。
 *
 * 不去找 service 层是因为**不该绕过落盘链路，而 Dexie 就是那条链路本身** ——
 * `vault-persist` 挂在 dbcore 中间件上，任何写都会进队列、序列化成 frontmatter、
 * 走原子写，并在 flush 成功时追加一条带 `actor` 的时间线。所以这里只要两件事做对：
 *   1. 包在 `runAsActorAsync('agent:assistant', …)` 里（时间线才认得出是谁）
 *   2. 顺带把 `updatedAt` 推一下（列表按它排序）
 */
/**
 * 词条的单篇模板只能换「笔记类」模板。
 *
 * 角色 / 事件 / 国家是实体模板：它们的字段读实体列，摆到词条上只会渲染出一堆空行。
 * 界面侧已经不列它们（`NoteTemplateButton`），助手这边也要挡住 —— 否则模型会
 * 写进一个渲染侧会忽略的名字，用户看到的是「说了改了，其实没变」。
 */
async function assertPerNoteTemplate(name: string): Promise<void> {
  const [{ getTemplates, loadTemplates }, { perNoteTemplates }] = await Promise.all([
    import('@/lib/templates/store'),
    import('@/lib/templates/note'),
  ])
  await loadTemplates()
  const candidates = perNoteTemplates(getTemplates())
  const found = candidates.some((doc) => doc.name === name || doc.id === name)
  if (!found) {
    const list = candidates.map((doc) => doc.name).join(' / ') || '（没有笔记类模板）'
    throw new Error(`词条只能用笔记类模板：${list}`)
  }
}

const writer: LibraryWriter = {
  async setFields(kind, id, patch) {
    const { db, runAsActorAsync } = await loadWriteDeps()
    await runAsActorAsync('agent:assistant', async () => {
      await db.table(TABLE_BY_KIND[kind]).update(id, { ...patch, updatedAt: Date.now() })
    })
  },
  async setBody(kind, id, markdown) {
    const { db, runAsActorAsync } = await loadWriteDeps()
    const { bodyDocFromMarkdown } = await import('@/lib/vault/write-body')
    const { worldBodyPatch } = await import('@/lib/world-body')
    // 正文只写 `document`（`lib/world-body.ts`）—— 词条也一样。
    // 以前这里对词条写 `content: JSON.stringify(doc)`，等于把刚收敛掉的两份真源
    // 又装回来一份；`npm run audit:world` 里有断言钉着这条。
    const patch = worldBodyPatch(bodyDocFromMarkdown(markdown))
    await runAsActorAsync('agent:assistant', async () => {
      await db.table(TABLE_BY_KIND[kind]).update(id, { ...patch, updatedAt: Date.now() })
    })
  },
  async create(kind, input) {
    const { runAsActorAsync } = await loadWriteDeps()
    const [defaults, characters, events, countries, world] = await Promise.all([
      import('@/lib/entity-defaults'),
      import('@/features/characters/services'),
      import('@/features/events/services'),
      import('@/features/countries/services'),
      import('@/features/world/services'),
    ])
    // 走各 feature 的 `create*`，不要在这里手拼一行塞进 Dexie ——
    // 那条路会漏掉操作日志与索引维护（见 `LibraryWriter.create` 的注释）。
    return runAsActorAsync('agent:assistant', async () => {
      if (kind === 'character') {
        return characters.createCharacter({ ...defaults.newCharacterData(), name: input.title, ...input.fields })
      }
      if (kind === 'event') {
        return events.createEvent({ ...defaults.newEventData(), title: input.title, ...input.fields })
      }
      if (kind === 'country') {
        return countries.createCountry({ ...defaults.newCountryData(), name: input.title, ...input.fields })
      }
      // 词条：分类 / 模板 / 父级是它的结构位（小说章节、自定义分类条目靠这三个）
      if (input.template !== undefined && input.template.trim() !== '') {
        await assertPerNoteTemplate(input.template.trim())
      }
      return world.createEntry({
        ...defaults.newWorldEntryData(),
        title: input.title,
        ...input.fields,
        category: input.category,
        template: input.template,
        parentId: input.parentId ?? null,
      })
    })
  },
  async delete(kind, id) {
    const { runAsActorAsync } = await loadWriteDeps()
    const [characters, events, countries, world] = await Promise.all([
      import('@/features/characters/services'),
      import('@/features/events/services'),
      import('@/features/countries/services'),
      import('@/features/world/services'),
    ])
    // 走各 feature 的 `delete*`：软删除 + 清引用 + 落盘队列（回收站能还原）
    await runAsActorAsync('agent:assistant', async () => {
      if (kind === 'character') await characters.deleteCharacter(id)
      else if (kind === 'event') await events.deleteEvent(id)
      else if (kind === 'country') await countries.deleteCountry(id)
      else await world.deleteEntry(id)
    })
  },
  async setTags(kind, id, names) {
    const { db, runAsActorAsync } = await loadWriteDeps()
    const [{ getAllTags, createTag }, { pickTagColor }] = await Promise.all([
      import('@/features/tags/services'),
      import('@/lib/tag-colors'),
    ])
    return runAsActorAsync('agent:assistant', async () => {
      const existing = await getAllTags()
      const byName = new Map(existing.map((tag) => [tag.name.trim(), tag]))
      const resolved: { id: number; name: string }[] = []
      for (const raw of names) {
        const name = raw.trim()
        if (name === '' || resolved.some((tag) => tag.name === name)) continue
        let tag = byName.get(name)
        if (!tag) {
          const tagId = await createTag({ name, category: '', color: pickTagColor(name) })
          tag = { id: tagId, name, category: '', color: pickTagColor(name) }
          byName.set(name, tag)
        }
        resolved.push({ id: tag.id, name: tag.name })
      }
      await db.table(TABLE_BY_KIND[kind]).update(id, {
        tags: resolved.map((tag) => tag.id),
        updatedAt: Date.now(),
      })
      return resolved
    })
  },
  async setCustom(kind, id, fields) {
    const { db, runAsActorAsync } = await loadWriteDeps()
    await runAsActorAsync('agent:assistant', async () => {
      const table = db.table(TABLE_BY_KIND[kind])
      const row = (await table.get(id)) as { custom?: Record<string, string> } | undefined
      const next = { ...(row?.custom ?? {}) }
      for (const [key, value] of Object.entries(fields)) {
        if (value.trim() === '') delete next[key]
        else next[key] = value
      }
      await table.update(id, { custom: next, updatedAt: Date.now() })
    })
  },
  async setMedia(kind, id, slot, path) {
    // 文件必须已经存在：这里只写引用，不做上传 / 裁剪 / 复制
    await writeMedia(kind, id, slot, path)
  },
  async importImage(kind, id, slot, url, filename) {
    if (!MEDIA_COLUMN[kind][slot]) throw new Error(`这个类型没有 ${slot} 槽位`)
    const [{ getVaultSession }, { vaultFs }] = await Promise.all([
      import('@/lib/vault/vault-session'),
      import('@/lib/vault/vault-fs'),
    ])
    const session = getVaultSession()
    if (!session) throw new Error('图片下载需要桌面版笔记库')
    const base = imageFileName(url, filename)
    try {
      await vaultFs.mkdir(session.root, '附件')
    } catch {
      // 目录已存在时可能抛错，忽略
    }
    // 不覆盖库里已有的同名图：加序号
    let target = base
    for (let index = 2; await vaultFs.exists(session.root, target); index += 1) {
      if (index > 99) throw new Error('同名图片太多了，换一个文件名')
      target = base.replace(/(\.[^.]+)$/, `-${index}$1`)
    }
    const result = await vaultFs.downloadImage(session.root, target, url)
    await writeMedia(kind, id, slot, result.relPath)
    return { path: result.relPath, bytes: result.bytes }
  },
  async rename(kind, id, title, aliases) {
    const { db, runAsActorAsync } = await loadWriteDeps()
    const [characters, events, countries, world] = await Promise.all([
      import('@/features/characters/services'),
      import('@/features/events/services'),
      import('@/features/countries/services'),
      import('@/features/world/services'),
    ])
    await runAsActorAsync('agent:assistant', async () => {
      if (kind === 'character') {
        // 角色的 update 同时吃 aliases；其余三种的 update 不接 aliases，下面补写
        await characters.updateCharacter(id, aliases ? { name: title, aliases } : { name: title })
        return
      }
      if (kind === 'event') await events.updateEvent(id, { title })
      else if (kind === 'country') await countries.updateCountry(id, { name: title })
      else await world.updateEntry(id, { title })
      if (aliases) {
        await db.table(TABLE_BY_KIND[kind]).update(id, { aliases, updatedAt: Date.now() })
      }
    })
  },
  async setPlacement(id, input) {
    const [{ getCategories, loadCategories }, { getTemplates, loadTemplates }, { NOVEL_CATEGORY, MAP_CATEGORY }] =
      await Promise.all([
        import('@/lib/categories/store'),
        import('@/lib/templates/store'),
        import('@/lib/entry-kinds'),
      ])
    await Promise.all([loadCategories(), loadTemplates()])

    // 只允许放进「已经存在」的分类 / 模板：名字必须能在目录里找到
    if (input.category !== undefined) {
      const category = input.category.trim()
      if (category !== '') {
        const names = new Set(getCategories().map((item) => item.name))
        names.add(NOVEL_CATEGORY)
        names.add(MAP_CATEGORY)
        if (!names.has(category)) throw new Error(`没有这个分类：${category}（先看库目录）`)
      }
    }
    if (input.template !== undefined) {
      const template = input.template.trim()
      if (template !== '') {
        const names = new Set(getTemplates().flatMap((doc) => [doc.name, doc.id]))
        if (!names.has(template)) throw new Error(`没有这个模板：${template}（先看库目录）`)
        await assertPerNoteTemplate(template)
      }
    }

    const { db, runAsActorAsync } = await loadWriteDeps()
    if (input.parentId !== undefined && input.parentId !== null) {
      // 不能挂到自己或自己的子孙下面；父级必须存在
      let cursor: number | null = input.parentId
      const seen = new Set<number>()
      while (cursor !== null) {
        if (cursor === id) throw new Error('不能把条目挂到它自己或它的子级下面')
        if (seen.has(cursor)) break
        seen.add(cursor)
        const row = (await db.worldEntries.get(cursor)) as
          | { parentId?: number | null }
          | undefined
        if (!row) throw new Error('父词条不存在')
        cursor = row.parentId ?? null
      }
    }

    const world = await import('@/features/world/services')
    await runAsActorAsync('agent:assistant', async () => {
      await world.updateEntry(id, {
        ...(input.category !== undefined ? { category: input.category.trim() } : {}),
        ...(input.template !== undefined ? { template: input.template.trim() } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      })
    })
  },
  async setNovel(id, input) {
    const { db, runAsActorAsync } = await loadWriteDeps()
    const { NOVEL_CATEGORY } = await import('@/lib/entry-kinds')
    const row = await db.worldEntries.get(id)
    if (!row) throw new Error(`词条 #${id} 不存在`)
    if (row.category !== NOVEL_CATEGORY) {
      throw new Error('这条不是小说根（先建一条 category=小说 的词条）')
    }
    const cover = input.cover !== undefined ? await normalizeVaultPath(input.cover) : undefined
    await runAsActorAsync('agent:assistant', async () => {
      await db.worldEntries.update(id, {
        ...(input.author !== undefined ? { novelAuthor: input.author } : {}),
        ...(input.synopsis !== undefined ? { novelSynopsis: input.synopsis } : {}),
        ...(input.targetWords !== undefined ? { novelTargetWords: input.targetWords } : {}),
        ...(input.notes !== undefined ? { novelNotes: input.notes } : {}),
        ...(cover !== undefined ? { novelCover: cover } : {}),
        updatedAt: Date.now(),
      })
    })
  },
  async createCategory(input) {
    const [
      { getCategories, saveCategories, loadCategories },
      { newCategoryId },
      { getTemplates, saveTemplate, loadTemplates },
      { isNoteTemplate },
      info,
      { normalizeCategoryIcon, DEFAULT_CATEGORY_ICON },
    ] = await Promise.all([
      import('@/lib/categories/store'),
      import('@/lib/categories/types'),
      import('@/lib/templates/store'),
      import('@/lib/templates/note'),
      import('@/lib/templates/info-groups'),
      import('@/lib/categories/icons'),
    ])
    await Promise.all([loadCategories(), loadTemplates(), info.loadInfoGroups()])

    const name = input.name.trim()
    if (name === '') throw new Error('分类名不能为空')
    const current = getCategories()
    if (current.some((category) => category.name === name)) {
      throw new Error(`已经有叫「${name}」的分类了`)
    }

    let templateId = 'entry'
    let groupId: string | undefined
    if (input.fields && input.fields.length > 0) {
      const groupName = `${name}字段`
      let group = info.getInfoGroups().find((item) => item.name === groupName)
      if (!group) group = await info.createInfoGroup({ name: groupName, fields: input.fields })
      if (input.labels && Object.keys(input.labels).length > 0) {
        await info.updateInfoGroup(group.id, { labels: { ...(group.labels ?? {}), ...input.labels } })
      }
      groupId = group.id

      // 模板名与 id 都不能撞：同名的后面加序号
      let templateName = `${name}模板`
      let suffix = 2
      while (getTemplates().some((doc) => doc.name === templateName)) {
        templateName = `${name}模板 ${suffix}`
        suffix += 1
      }
      let templateDocId = `custom-${Date.now().toString(36)}`
      while (getTemplates().some((doc) => doc.id === templateDocId)) {
        templateDocId = `custom-${Date.now().toString(36)}-${suffix}`
        suffix += 1
      }
      const doc: TemplateDoc = {
        id: templateDocId,
        name: templateName,
        aliases: [],
        components: [
          { id: 'cover', enabled: true },
          { id: 'info', enabled: true, params: { group: group.id } },
          { id: 'tags', enabled: true },
          { id: 'body', enabled: true },
        ],
      }
      await saveTemplate(doc)
      templateId = doc.id
    } else if (input.template) {
      const found = getTemplates().find(
        (doc) => doc.id === input.template || doc.name === input.template,
      )
      if (!found) throw new Error(`没有这个模板：${input.template}`)
      if (!isNoteTemplate(found)) throw new Error('这个模板不含正文，不能绑到分类')
      templateId = found.id
    }

    const category: Category = {
      id: newCategoryId(),
      name,
      template: templateId,
      icon: normalizeCategoryIcon(input.icon || DEFAULT_CATEGORY_ICON),
      order: current.reduce((max, item) => Math.max(max, item.order), 0) + 1,
      enabled: true,
    }
    await saveCategories([...current, category])
    return { id: category.id, name, template: templateId, group: groupId, fields: input.fields }
  },
  async link(from, to, relation, toName) {
    const { db, runAsActorAsync } = await loadWriteDeps()
    const now = Date.now()
    return runAsActorAsync('agent:assistant', async () => {
      if (from.kind === 'character' && to.kind === 'character') {
        const row = await db.characters.get(from.id)
        if (!row) return { changed: false }
        const list = row.relatedCharacters ?? []
        if (list.some((item) => item.characterId === to.id)) return { changed: false }
        await db.characters.update(from.id, {
          relatedCharacters: [...list, { characterId: to.id, name: toName, relation }],
          updatedAt: now,
        })
        return { changed: true }
      }
      if (from.kind === 'character' && to.kind === 'country') {
        const row = await db.characters.get(from.id)
        if (!row || row.countryId === to.id) return { changed: false }
        // 国籍只有这一个真源；国家页的名单是查询，不写
        await db.characters.update(from.id, { countryId: to.id, updatedAt: now })
        return { changed: true }
      }
      if (from.kind === 'event' && (to.kind === 'character' || to.kind === 'country')) {
        const row = await db.events.get(from.id)
        if (!row) return { changed: false }
        if (to.kind === 'character') {
          const list = row.characters ?? []
          if (list.includes(to.id)) return { changed: false }
          await db.events.update(from.id, { characters: [...list, to.id], updatedAt: now })
          return { changed: true }
        }
        const list = row.countries ?? []
        if (list.includes(to.id)) return { changed: false }
        await db.events.update(from.id, { countries: [...list, to.id], updatedAt: now })
        return { changed: true }
      }
      return { changed: false }
    })
  },
}

/**
 * 库目录：模板（组件 + 字段组）与分类。
 *
 * 模型推不出这些 —— 只看到字段组名「宠物」时，它不知道该写 `物种` 还是 `species`；
 * 只看到模板名「宠物」时，它不知道那个模板用了哪份基本信息组件。猜错就是往不存在的键里写值。
 */
const catalog: LibraryCatalog = {
  async describe() {
    const [{ getTemplates, loadTemplates }, info, { getCategories, loadCategories }] = await Promise.all([
      import('@/lib/templates/store'),
      import('@/lib/templates/info-groups'),
      import('@/lib/categories/store'),
    ])
    await Promise.all([loadTemplates(), loadCategories(), info.loadInfoGroups()])

    const groupsById = new Map(info.getInfoGroups().map((group) => [group.id, group]))
    const templates = getTemplates().map((template) => {
      const infoComponent = template.components.find((component) => component.id === 'info')
      const rawGroup = infoComponent?.params?.group
      const groupId = typeof rawGroup === 'string' ? rawGroup : ''
      const group = groupId !== '' ? groupsById.get(groupId) : undefined
      // 老模板把字段内联在 `fields` 里，没有 group —— 两种都认
      const inline = Array.isArray(infoComponent?.params?.fields)
        ? (infoComponent.params.fields as unknown[]).filter((key): key is string => typeof key === 'string')
        : []
      // 特殊字段（时间 / 结束时间 / 地点）写的是实体列，不是自建键 ——
      // 列在「自建字段」里会引着模型往 `custom` 里写一个永远不生效的键
      const types = group?.types ?? {}
      const keys = (group ? group.fields : inline).filter(
        (key) => !info.isSpecialInfoFieldType(types[key]),
      )
      return {
        id: template.id,
        name: template.name,
        components: template.components.map((component) => ({
          id: component.id,
          enabled: component.enabled,
        })),
        fields: keys.map((key) => ({
          key,
          label: group ? info.infoFieldLabelOf(group, key) : key,
        })),
      }
    })

    return {
      templates,
      categories: getCategories().map((category) => ({
        name: category.name,
        template: category.template,
        enabled: category.enabled !== false,
      })),
    }
  },
}

/** 写到一半才装载 Dexie，构建期与 SSR 都不会碰它 */
async function loadWriteDeps(): Promise<{
  db: typeof import('@/lib/db').db
  runAsActorAsync: typeof import('@/lib/vault/actor').runAsActorAsync
}> {
  const [{ db }, { runAsActorAsync }] = await Promise.all([
    import('@/lib/db'),
    import('@/lib/vault/actor'),
  ])
  return { db, runAsActorAsync }
}

let executor: Executor | null = null
let loading: Promise<Executor> | null = null

async function loadExecutor(): Promise<Executor> {
  if (executor) return executor
  loading ??= (async () => {
    const [{ createCapabilities }, { createDexieCapabilityStore }] = await Promise.all([
      import('@/lib/capabilities'),
      import('@/lib/capabilities/dexie-store'),
    ])
    executor = createLibraryToolExecutor(
      createCapabilities(createDexieCapabilityStore()),
      writer,
      catalog,
    )
    return executor
  })()
  return loading
}

/** 归宿主管的工具返回结果；不归它管返回 `null`，调用方继续走插件自己的路径 */
export async function resolveLibraryTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: string; isError: boolean; data?: unknown; durationMs: number } | null> {
  if (isLibraryTool(name) && !libraryAccessGranted()) {
    return {
      content: '助手没有启用，这个环境看不到设定库。可以在 设置 › 插件 里打开。',
      isError: true,
      durationMs: 0,
    }
  }
  const run = await loadExecutor()
  return run(name, args)
}
