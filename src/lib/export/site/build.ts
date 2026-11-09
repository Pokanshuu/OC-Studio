import { worldBodyOf } from '@/lib/world-body'
import type { Character, Country, Event, Period, ProjectMeta, Tag, WorldEntry } from '@/types'
import { buildEntryTree, type WorldTreeNode } from '@/lib/world-tree'
import type { ThemeTokens } from '@/lib/theme/presets'
import { collectDocImages, escapeHtml, hasRichText, plainTextOf, renderRichText, type RenderOptions } from './render'
import { SITE_CSS } from './styles'
import { siteTemplateOf } from './templates'
import type { SiteTemplateId } from './template-types'
import { componentLabel, componentParam } from '@/lib/templates/params'
import type { TemplateComponentId, TemplateDoc } from '@/lib/templates/types'
import type { FieldConfig } from '@/lib/fields/types'

/** 展示站需要的全部数据（软删除的行由调用方过滤掉）。 */
export interface SiteData {
  meta: ProjectMeta | null
  characters: Character[]
  events: Event[]
  countries: Country[]
  worldEntries: WorldEntry[]
  tags: Tag[]
  periods: Period[]
}

/** 导出时保留哪些分区（缺省 = 全部保留）。 */
export interface SiteSectionOptions {
  timeline: boolean
  characters: boolean
  events: boolean
  countries: boolean
  world: boolean
  relations: boolean
}

/** 静态站的纸色：由应用主题解析成一组令牌，不在这里读设置。 */
export type SiteThemeTokens = ThemeTokens

export interface BuildOptions {
  /** 图片 src → data URI；未命中的保持原样 */
  images: Map<string, string>
  /** 站点标题（缺省 = 世界名） */
  title?: string
  /** 分区开关；关掉的分区不生成页面、不生成导航、引用回落成纯文本 */
  sections?: Partial<SiteSectionOptions>
  /** 固定纸色；缺省时跟随读者系统的亮暗 */
  theme?: SiteThemeTokens
  /** 版式；缺省 = 书斋（侧栏 / 纸书观感） */
  template?: SiteTemplateId
  /**
   * 编辑器模板（可选）。给了就按模板的组件开关 / 标题文案 / 显示开关渲染详情页：
   * 图集、相关角色、时间、地点这些标题与显隐不再写死。没给（脚本 / 旧调用）保持原行为。
   */
  templates?: TemplateDoc[]
  /**
   * 字段表（可选）。事件的时间 / 结束时间 / 地点现在是「基本信息」的字段行，
   * 显隐与文案由字段表决定；没给（脚本 / 旧调用）按「有值就打印」保持原行为。
   */
  fields?: FieldConfig
}

const DEFAULT_SECTIONS: SiteSectionOptions = {
  timeline: true,
  characters: true,
  events: true,
  countries: true,
  world: true,
  relations: true,
}

/**
 * 分区开关的**唯一实现**：只在入口过滤一次数据，后面的页面生成 / 引用解析 /
 * 导航都自然跟着走（被关掉的实体不存在，引用就会回落成纯文本）。
 * 不要在各个渲染分支里散落 `if (enabled)`。
 */
function normalizeSections(sections?: Partial<SiteSectionOptions>): SiteSectionOptions {
  const on = { ...DEFAULT_SECTIONS }
  if (sections) {
    for (const key of Object.keys(DEFAULT_SECTIONS) as (keyof SiteSectionOptions)[]) {
      if (typeof sections[key] === 'boolean') on[key] = sections[key]
    }
  }
  return on
}

/**
 * 编辑器模板 → 导出用的「这一块显不显示、叫什么」。
 *
 * 语义与编辑器一致：组件存在且启用 → 显示；有 `title` 参数且为 false → 不显示；
 * 标题文案优先 `label`。没有模板（脚本 / 老调用）时全部按显示、用默认文案。
 */
function siteTemplateViewOf(doc: TemplateDoc | undefined) {
  const componentOf = (id: TemplateComponentId) =>
    doc?.components.find((component) => component.id === id && component.enabled)
  return {
    /** 没有模板时不拦；有模板时看组件在不在、开没开（`title` 只管标题行，不管内容） */
    enabled(id: TemplateComponentId): boolean {
      if (doc === undefined) return true
      return componentOf(id) !== undefined
    },
    label(id: TemplateComponentId, fallback: string): string {
      const component = componentOf(id)
      return component === undefined ? fallback : componentLabel(component) || fallback
    },
    /** 组件在模板里的位置（没有模板 / 没有这个组件 = 0，排序稳定） */
    order(id: TemplateComponentId): number {
      if (doc === undefined) return 0
      const index = doc.components.findIndex((component) => component.id === id)
      return index < 0 ? Number.MAX_SAFE_INTEGER : index
    },
    /** 标题行：`title: false` = 不打印标题（内容照常），组件没有 = 整块不打印 */
    heading(id: TemplateComponentId, fallback: string): string | null {
      const component = componentOf(id)
      if (doc !== undefined && component === undefined) return null
      if (component !== undefined && componentParam(component, 'title', true) === false) return null
      return component === undefined ? fallback : componentLabel(component) || fallback
    },
  }
}

function siteTemplateView(templates: TemplateDoc[] | undefined, templateId: string) {
  return siteTemplateViewOf(templates?.find((item) => item.id === templateId))
}

/** 详情页的内容区块按模板顺序排；没有模板时保持原来的固定顺序（稳定排序） */
function joinByTemplateOrder(chunks: { order: number; html: string }[]): string {
  return chunks
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((chunk) => chunk.html)
    .join('')
}

export function applySiteSections(data: SiteData, sections?: Partial<SiteSectionOptions>): SiteData {
  const on = normalizeSections(sections)
  return {
    ...data,
    characters: on.characters ? data.characters : [],
    events: on.events ? data.events : [],
    countries: on.countries ? data.countries : [],
    worldEntries: on.world ? data.worldEntries : [],
  }
}

const ROUTE_BY_KIND: Record<string, string> = {
  character: 'characters',
  event: 'events',
  country: 'countries',
  world: 'world',
}

// ── 小工具 ────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` / `YYYY-MM` / `-500-01` → 数字年份（解析不出返回 null） */
function yearOf(time: string | undefined): number | null {
  const match = /^(-?)(\d{1,4})/.exec((time ?? '').trim())
  if (!match) return null
  const value = Number(match[2])
  return Number.isFinite(value) ? (match[1] === '-' ? -value : value) : null
}

export function timeLabel(time: string | undefined, endTime?: string): string {
  const start = (time ?? '').trim()
  const end = (endTime ?? '').trim()
  if (!start) return end || '未定年'
  return end && end !== start ? `${start} ~ ${end}` : start
}

export function dateLabel(ms: number | undefined): string {
  if (!ms || !Number.isFinite(ms)) return ''
  // 不能用 `toISOString()`：东八区凌晨会少一天。导出页脚 / 列表日期都按本地日历走。
  const date = new Date(ms)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function shortText(value: unknown, max = 90): string {
  const text = plainTextOf(value).replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function fieldValue(...parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.trim() !== '').join('')
}

// ── 构建器 ────────────────────────────────────────────────────────────

/** 写进 `<script>` 的字符串：转义 `<`，避免标题里的 `</script>` 把脚本截断。 */
function scriptJson(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

export function buildSite(input: SiteData, options: BuildOptions): string {
  const { images } = options
  const enabled = normalizeSections(options.sections)
  const data = applySiteSections(input, enabled)
  const template = siteTemplateOf(options.template)

  const charactersById = new Map(data.characters.map((c) => [c.id, c]))
  const eventsById = new Map(data.events.map((e) => [e.id, e]))
  const countriesById = new Map(data.countries.map((c) => [c.id, c]))
  const worldById = new Map(data.worldEntries.map((w) => [w.id, w]))
  const tagsById = new Map(data.tags.map((t) => [t.id, t]))

  // 详情页的标题与显隐跟着编辑器模板走（没给模板时保持原来的写死行为）
  const characterView = siteTemplateView(options.templates, 'character')
  const eventView = siteTemplateView(options.templates, 'event')
  const countryView = siteTemplateView(options.templates, 'country')
  const entryView = siteTemplateView(options.templates, 'entry')

  const exists = (kind: string, id: number): boolean => {
    switch (kind) {
      case 'character': return charactersById.has(id)
      case 'event': return eventsById.has(id)
      case 'country': return countriesById.has(id)
      default: return worldById.has(id)
    }
  }

  const renderOptions: RenderOptions = {
    resolveImage: (src) => images.get(src) ?? src,
    resolveLink: (kind, id) => (exists(kind, id) ? `#/${ROUTE_BY_KIND[kind] ?? 'world'}/${id}` : null),
  }

  const img = (url: string | undefined): string => (url ? images.get(url) ?? url : '')
  const doc = (value: unknown): string =>
    hasRichText(value) ? `<div class="doc">${renderRichText(value, renderOptions)}</div>` : ''

  const tagChips = (ids: number[] | undefined): string => {
    const list = (ids ?? []).map((id) => tagsById.get(id)).filter((t): t is Tag => Boolean(t))
    if (list.length === 0) return ''
    return `<div class="chips">${list
      .map((t) => `<span class="chip" style="border-color:${escapeHtml(t.color)}55;color:${escapeHtml(t.color)}">${escapeHtml(t.name)}</span>`)
      .join('')}</div>`
  }

  const fieldRow = (key: string, value: string): string =>
    value ? `<div class="field"><div class="key">${escapeHtml(key)}</div><div class="val">${value}</div></div>` : ''

  const refLink = (kind: string, id: number, label: string): string => {
    const route = ROUTE_BY_KIND[kind] ?? 'world'
    return exists(kind, id)
      ? `<a class="ref" href="#/${route}/${id}">${escapeHtml(label)}</a>`
      : `<span>${escapeHtml(label)}</span>`
  }

  // ── 概览 ──────────────────────────────────────────────────────────

  const worldName = (data.meta?.worldName ?? '').trim() || 'OC Studio'
  const siteTitle = (options.title ?? '').trim() || worldName
  const tagline = (data.meta?.tagline ?? '').trim()
  const cover = img(data.meta?.coverUrl)

  const majors = data.characters.filter((c) => c.isMajor)
  const featured = (majors.length > 0 ? majors : data.characters).slice(0, 6)

  const recent = [
    ...data.characters.map((c) => ({ kind: 'character', id: c.id, name: c.name, at: c.updatedAt })),
    ...data.events.map((e) => ({ kind: 'event', id: e.id, name: e.title, at: e.updatedAt })),
    ...data.countries.map((c) => ({ kind: 'country', id: c.id, name: c.name, at: c.updatedAt })),
    ...data.worldEntries.map((w) => ({ kind: 'world', id: w.id, name: w.title, at: w.updatedAt })),
  ]
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
    .slice(0, 6)

  const kindLabel: Record<string, string> = {
    character: '角色',
    event: '事件',
    country: '国家',
    world: '词条',
  }

  const stats = [
    enabled.characters ? { href: '#/characters', count: data.characters.length, label: '角色' } : null,
    enabled.events ? { href: '#/events', count: data.events.length, label: '事件' } : null,
    enabled.countries ? { href: '#/countries', count: data.countries.length, label: '国家' } : null,
    enabled.world ? { href: '#/world', count: data.worldEntries.length, label: '词条' } : null,
  ].filter((item): item is { href: string; count: number; label: string } => item !== null)

  const home = `
    ${cover ? `<img class="cover" src="${escapeHtml(cover)}" alt="">` : ''}
    <h1 class="page-title">${escapeHtml(siteTitle)}</h1>
    ${tagline ? `<p class="page-sub">${escapeHtml(tagline)}</p>` : ''}
    ${stats.length > 0 ? `<div class="stats">${stats
      .map((item) => `<a class="stat" href="${item.href}"><div class="num">${item.count}</div><div class="label">${item.label}</div></a>`)
      .join('')}</div>` : ''}
    ${
      featured.length > 0
        ? `<h2 class="section-title">${majors.length > 0 ? '主要角色' : '角色'}</h2>
           <div class="grid">${featured.map((c) => characterCard(c)).join('')}</div>`
        : ''
    }
    ${
      recent.length > 0
        ? `<h2 class="section-title">最近更新</h2>
           <div class="rows">${recent
             .map(
               (r) => `<a class="row" href="#/${ROUTE_BY_KIND[r.kind]}/${r.id}">
                 <div class="when">${escapeHtml(dateLabel(r.at))}</div>
                 <div class="body"><div class="title">${escapeHtml(r.name || '未命名')}</div>
                 <div class="note">${escapeHtml(kindLabel[r.kind] ?? '')}</div></div></a>`,
             )
             .join('')}</div>`
        : ''
    }
    ${data.characters.length + data.events.length + data.countries.length + data.worldEntries.length === 0 ? '<div class="empty">这个世界还没有内容</div>' : ''}
  `

  function characterCard(c: Character): string {
    const thumb = img(c.avatarUrl) || img(c.gallery[0]?.url) || img(c.avatars[0]?.url)
    return `<a class="card" href="#/characters/${c.id}">
      ${thumb ? `<img class="thumb" src="${escapeHtml(thumb)}" alt="" loading="lazy">` : ''}
      <div class="name">${escapeHtml(c.name || '未命名')}</div>
      <div class="meta">${escapeHtml(fieldValue([c.race, c.occupation].filter(Boolean).join(' · ')))}</div>
    </a>`
  }

  // ── 时间线 ────────────────────────────────────────────────────────

  const sortedEvents = [...data.events].sort((a, b) => {
    const ay = yearOf(a.time)
    const by = yearOf(b.time)
    if (ay === null && by === null) return a.title.localeCompare(b.title)
    if (ay === null) return 1
    if (by === null) return -1
    return ay - by
  })

  const timeline = `
    <h1 class="page-title">时间线</h1>
    ${
      data.periods.length > 0
        ? `<h2 class="section-title">时期</h2>
           <div class="rows">${data.periods
             .map(
               (p) => `<div class="row"><div class="when">${escapeHtml(timeLabel(p.startTime, p.endTime))}</div>
                 <div class="body"><div class="title"><span style="display:inline-block;width:8px;height:8px;background:${escapeHtml(p.color)};margin-right:8px"></span>${escapeHtml(p.name)}</div></div></div>`,
             )
             .join('')}</div>`
        : ''
    }
    <h2 class="section-title">事件</h2>
    ${
      sortedEvents.length > 0
        ? `<div class="rows timeline-rows">${sortedEvents.map((e) => eventRow(e)).join('')}</div>`
        : '<div class="empty">还没有事件</div>'
    }
  `

  function eventRow(e: Event): string {
    return `<a class="row${e.isMajor ? ' major' : ''}" href="#/events/${e.id}">
      <div class="when">${escapeHtml(timeLabel(e.time, e.endTime))}</div>
      <div class="body"><div class="title">${escapeHtml(e.title || '未命名')}</div>
      ${e.summary ? `<div class="note">${escapeHtml(shortText(e.summary))}</div>` : ''}</div></a>`
  }

  // ── 角色 ──────────────────────────────────────────────────────────

  const sortedCharacters = [...data.characters].sort((a, b) => {
    if (Boolean(a.isMajor) !== Boolean(b.isMajor)) return a.isMajor ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-CN')
  })

  const charactersList = `
    <h1 class="page-title">角色</h1>
    <p class="page-sub">共 ${data.characters.length} 位</p>
    ${sortedCharacters.length > 0 ? `<div class="grid" style="margin-top:22px">${sortedCharacters.map((c) => characterCard(c)).join('')}</div>` : '<div class="empty">还没有角色</div>'}
  `

  const characterDetails = sortedCharacters.map((c) => {
    const country = c.countryId ? countriesById.get(c.countryId) : undefined
    const relatedEvents = data.events.filter((e) => (e.characters ?? []).includes(c.id))
    const body = hasRichText(c.document) ? c.document : `${c.bio}\n\n${c.lifeStory}`
    const galleryEnabled = characterView.enabled('gallery')
    const gallery = galleryEnabled ? [...c.gallery, ...c.avatars].filter((g) => g?.url) : []
    const galleryHeading = characterView.heading('gallery', '图集')
    const relationsHeading = characterView.heading('relations', '相关角色')
    const relationsEnabled = characterView.enabled('relations')

    const galleryChunk =
      gallery.length > 0
        ? `${galleryHeading === null ? '' : `<h2 class="section-title">${escapeHtml(galleryHeading)}</h2>`}<div class="gallery">${gallery
            .map(
              (g) => `<figure><img src="${escapeHtml(img(g.url))}" alt="" loading="lazy">${
                'caption' in g && g.caption ? `<figcaption>${escapeHtml(g.caption)}</figcaption>` : ''
              }</figure>`,
            )
            .join('')}</div>`
        : ''

    const relationsChunk = [
      relationsEnabled && c.relatedCharacters.length > 0
        ? `${relationsHeading === null ? '' : `<h2 class="section-title">${escapeHtml(relationsHeading)}</h2>`}
           <table class="rel-table"><thead><tr><th>关系</th><th>角色</th></tr></thead><tbody>
           ${c.relatedCharacters
             .map(
               (r) =>
                 `<tr><td>${escapeHtml(r.relation)}</td><td>${
                   r.characterId ? refLink('character', r.characterId, r.name) : escapeHtml(r.name)
                 }</td></tr>`,
             )
             .join('')}
           </tbody></table>`
        : '',
      relationsEnabled && relatedEvents.length > 0
        ? `${relationsHeading === null ? '' : '<h2 class="section-title">相关事件</h2>'}
           <div class="rows">${relatedEvents.map((e) => eventRow(e)).join('')}</div>`
        : '',
    ].join('')

    const contentChunks = [
      { order: characterView.order('relations'), html: relationsChunk },
      { order: Math.min(characterView.order('gallery'), characterView.order('portrait')), html: galleryChunk },
      { order: characterView.order('body'), html: doc(body) },
    ].filter((chunk) => chunk.html !== '')

    return `
      <a class="crumb" href="#/characters">← 角色</a>
      ${img(c.headerUrl) ? `<img class="banner" src="${escapeHtml(img(c.headerUrl))}" alt="">` : ''}
      <div class="head">
        ${img(c.avatarUrl) ? `<img class="avatar" src="${escapeHtml(img(c.avatarUrl))}" alt="">` : ''}
        <div>
          <h1 class="page-title">${escapeHtml(c.name || '未命名')}</h1>
          ${c.aliases.length ? `<p class="page-sub">${escapeHtml(c.aliases.join('、'))}</p>` : ''}
        </div>
      </div>
      <div class="fields">
        ${fieldRow('种族', escapeHtml(c.race))}
        ${fieldRow('元素', escapeHtml(c.element))}
        ${fieldRow('职业', escapeHtml(c.occupation))}
        ${fieldRow('阵营', escapeHtml(c.faction))}
        ${fieldRow('国家', country ? refLink('country', country.id, country.name) : escapeHtml(c.nationalityLegacy))}
        ${fieldRow('身高', escapeHtml(c.height))}
        ${fieldRow('生日', escapeHtml(c.birthday))}
        ${fieldRow('标签', tagChips(c.tags))}
      </div>
      ${joinByTemplateOrder(contentChunks)}
    `
  })

  // ── 事件 ──────────────────────────────────────────────────────────

  const eventsList = `
    <h1 class="page-title">事件</h1>
    <p class="page-sub">共 ${data.events.length} 件</p>
    ${sortedEvents.length > 0 ? `<div class="rows" style="margin-top:22px">${sortedEvents.map((e) => eventRow(e)).join('')}</div>` : '<div class="empty">还没有事件</div>'}
  `

  const eventDetails = data.events.map((e) => {
    const people = (e.characters ?? []).map((id) => charactersById.get(id)).filter((c): c is Character => Boolean(c))
    const lands = (e.countries ?? []).map((id) => countriesById.get(id)).filter((c): c is Country => Boolean(c))
    const links = (e.relations ?? []).map((r) => eventsById.get(r.targetId)).filter((x): x is Event => Boolean(x))
    const body = hasRichText(e.document) ? e.document : `${e.summary}\n\n${e.content}`
    const gallery = eventView.enabled('gallery') ? (e.images ?? []).filter((g) => g?.url) : []
    const galleryHeading = eventView.heading('gallery', '图集')
    // 时间 / 结束时间 / 地点是字段表的行（`lib/fields`），不是模板组件了。
    // 没给字段表时（脚本 / 旧调用）保持原样：两条都打印。
    const eventFields = options.fields?.event
    const timeField = eventFields?.find((field) => field.id === 'time' || field.id === 'endTime')
    const placeField = eventFields?.find((field) => field.id === 'location')
    const timeShown = eventFields === undefined || timeField !== undefined
    const placeShown = eventFields === undefined || placeField !== undefined

    const galleryChunk =
      gallery.length > 0
        ? `${galleryHeading === null ? '' : `<h2 class="section-title">${escapeHtml(galleryHeading)}</h2>`}<div class="gallery">${gallery
            .map(
              (g) => `<figure><img src="${escapeHtml(img(g.url))}" alt="" loading="lazy">${
                g.caption ? `<figcaption>${escapeHtml(g.caption)}</figcaption>` : ''
              }</figure>`,
            )
            .join('')}</div>`
        : ''
    const contentChunks = [
      { order: eventView.order('body'), html: doc(body) },
      { order: eventView.order('gallery'), html: galleryChunk },
    ].filter((chunk) => chunk.html !== '')

    return `
      <a class="crumb" href="#/events">← 事件</a>
      ${img(e.headerUrl) ? `<img class="banner" src="${escapeHtml(img(e.headerUrl))}" alt="">` : ''}
      <h1 class="page-title">${escapeHtml(e.title || '未命名')}${e.isMajor ? ' ★' : ''}</h1>
      <div class="fields">
        ${timeShown ? fieldRow(timeField?.label ?? '时间', escapeHtml(timeLabel(e.time, e.endTime))) : ''}
        ${placeShown ? fieldRow(placeField?.label ?? '地点', escapeHtml(e.location)) : ''}
        ${fieldRow('参与角色', people.map((p) => refLink('character', p.id, p.name)).join('、'))}
        ${fieldRow('相关国家', lands.map((l) => refLink('country', l.id, l.name)).join('、'))}
        ${fieldRow('相关事件', links.map((l) => refLink('event', l.id, l.title)).join('、'))}
        ${fieldRow('标签', tagChips(e.tags))}
      </div>
      ${joinByTemplateOrder(contentChunks)}
    `
  })

  // ── 国家 ──────────────────────────────────────────────────────────

  const countriesList = `
    <h1 class="page-title">国家</h1>
    <p class="page-sub">共 ${data.countries.length} 个</p>
    ${
      data.countries.length > 0
        ? `<div class="grid" style="margin-top:22px">${data.countries
            .map((c) => {
              const thumb = img(c.flagUrl) || img(c.headerUrl)
              return `<a class="card" href="#/countries/${c.id}">
                ${thumb ? `<img class="thumb" src="${escapeHtml(thumb)}" alt="" loading="lazy">` : ''}
                <div class="name">${escapeHtml(c.name || '未命名')}</div>
                <div class="meta">${escapeHtml(shortText(c.description || c.system))}</div>
              </a>`
            })
            .join('')}</div>`
        : '<div class="empty">还没有国家</div>'
    }
  `

  const countryDetails = data.countries.map((c) => {
    // 名单是查询出来的（阶段二·一）：角色看国籍、事件看相关国家，国家行上没有第二份
    const people = data.characters.filter((x) => x.countryId === c.id)
    const lands = data.events.filter((e) => (e.countries ?? []).includes(c.id))
    const body = hasRichText(c.document) ? c.document : [c.description, c.system, c.geography, c.culture].join('\n\n')

    const galleryHeading = countryView.heading('gallery', '图集')
    const galleryChunk =
      countryView.enabled('gallery') && (c.gallery ?? []).length > 0
        ? `${galleryHeading === null ? '' : `<h2 class="section-title">${escapeHtml(galleryHeading)}</h2>`}<div class="gallery">${(c.gallery ?? [])
            .filter((g) => g?.url)
            .map(
              (g) =>
                `<figure><img src="${escapeHtml(img(g.url))}" alt="" loading="lazy">${
                  g.caption ? `<figcaption>${escapeHtml(g.caption)}</figcaption>` : ''
                }</figure>`,
            )
            .join('')}</div>`
        : ''

    const relationsHeading = countryView.heading('relations', '人物')
    const relationsChunk = countryView.enabled('relations')
      ? [
          people.length > 0
            ? `${relationsHeading === null ? '' : `<h2 class="section-title">${escapeHtml(relationsHeading)}</h2>`}<div class="rows">${people
                .map(
                  (p) => `<a class="row" href="#/characters/${p.id}"><div class="when"></div><div class="body"><div class="title">${escapeHtml(p.name)}</div></div></a>`,
                )
                .join('')}</div>`
            : '',
          lands.length > 0
            ? `${relationsHeading === null ? '' : '<h2 class="section-title">相关事件</h2>'}<div class="rows">${lands.map((e) => eventRow(e)).join('')}</div>`
            : '',
        ].join('')
      : ''

    const contentChunks = [
      { order: countryView.order('body'), html: doc(body) },
      { order: countryView.order('gallery'), html: galleryChunk },
      { order: countryView.order('relations'), html: relationsChunk },
    ].filter((chunk) => chunk.html !== '')

    return `
      <a class="crumb" href="#/countries">← 国家</a>
      ${img(c.headerUrl) ? `<img class="banner" src="${escapeHtml(img(c.headerUrl))}" alt="">` : ''}
      <div class="head">
        ${img(c.flagUrl) ? `<img class="avatar" src="${escapeHtml(img(c.flagUrl))}" alt="">` : ''}
        <div><h1 class="page-title">${escapeHtml(c.name || '未命名')}</h1>
        ${c.aliases?.length ? `<p class="page-sub">${escapeHtml(c.aliases.join('、'))}</p>` : ''}</div>
      </div>
      <div class="fields">
        ${fieldRow('体制', escapeHtml(c.system))}
        ${fieldRow('地理', escapeHtml(c.geography))}
        ${fieldRow('文化', escapeHtml(c.culture))}
        ${Object.entries(c.custom ?? {})
          .filter(([, value]) => value.trim() !== '')
          .map(([label, value]) => fieldRow(escapeHtml(label), escapeHtml(value)))
          .join('')}
        ${fieldRow('标签', tagChips(c.tags))}
      </div>
      ${joinByTemplateOrder(contentChunks)}
    `
  })

  // ── 词条 ──────────────────────────────────────────────────────────
  // 章节按**词条树**分（`parentId`）：有子项的一级词条当章节标题，子孙按深度缩进。
  // 以前那个凭 `category` 自由文本分组的做法已经删了 —— 它跟树完全无关。
  const worldTree = buildEntryTree(data.worldEntries)

  const entryViewFor = (entry: WorldEntry) =>
    entry.template
      ? siteTemplateViewOf(
          options.templates?.find(
            (doc) => doc.id === entry.template || doc.name === entry.template,
          ),
        )
      : entryView

  const entryRow = (node: WorldTreeNode, depth: number): string => {
    const w = node.entry
    const text = shortText(w.content || w.document)
    // 缩进最多四级，再深就不再加宽 —— 否则手机上一行只剩几个字
    return `<a class="row" style="--depth:${Math.min(depth, 4)}" href="#/world/${w.id}"><div class="when"></div>
      <div class="body"><div class="title">${escapeHtml(w.title || '未命名')}</div>
      ${text ? `<div class="note">${escapeHtml(text)}</div>` : ''}</div></a>`
  }

  const renderChapter = (node: WorldTreeNode): string => {
    const rows: string[] = []
    const walk = (children: WorldTreeNode[], depth: number) => {
      for (const child of children) {
        rows.push(entryRow(child, depth))
        walk(child.children, depth + 1)
      }
    }
    walk(node.children, 1)
    return `<h2 class="section-title"><a href="#/world/${node.entry.id}">${escapeHtml(node.entry.title || '未命名')}</a></h2>
      ${rows.length > 0 ? `<div class="rows">${rows.join('')}</div>` : ''}`
  }

  const chapters = worldTree.filter((node) => node.children.length > 0)
  const loose = worldTree.filter((node) => node.children.length === 0)

  const worldList = `
    <h1 class="page-title">词条</h1>
    <p class="page-sub">共 ${data.worldEntries.length} 条</p>
    ${chapters.map(renderChapter).join('')}
    ${
      loose.length > 0
        ? `${chapters.length > 0 ? '<h2 class="section-title">其它</h2>' : ''}
           <div class="rows">${loose.map((node) => entryRow(node, 0)).join('')}</div>`
        : ''
    }
    ${worldTree.length === 0 ? '<div class="empty">还没有词条</div>' : ''}
  `

  const worldDetails = data.worldEntries.map((w) => {
    const parent = w.parentId !== null && w.parentId !== undefined ? worldById.get(w.parentId) : undefined
    const manualRefs = (w.relations ?? [])
      .map((relation) => {
        const target =
          relation.targetId !== undefined ? worldById.get(relation.targetId) : undefined
        if (!target) return ''
        const label = `${escapeHtml(target.title || '未命名')}${
          relation.relation ? `（${escapeHtml(relation.relation)}）` : ''
        }`
        return `<a class="ref" href="#/world/${target.id}">${label}</a>`
      })
      .filter(Boolean)
    const refs = (w.references ?? [])
      .map((r) => {
        const route = ROUTE_BY_KIND[r.targetType] ?? 'world'
        const known =
          r.targetType === 'character'
            ? charactersById.get(r.targetId)
            : r.targetType === 'event'
              ? eventsById.get(r.targetId)
              : r.targetType === 'country'
                ? countriesById.get(r.targetId)
                : worldById.get(r.targetId)
        const label =
          known && 'name' in known
            ? known.name
            : known && 'title' in known
              ? known.title
              : `#${r.targetId}`
        return known ? `<a class="ref" href="#/${route}/${r.targetId}">${escapeHtml(label)}</a>` : ''
      })
      .filter(Boolean)

    const wView = entryViewFor(w)

    const galleryHeading = wView.heading('gallery', '图集')
    const galleryChunk =
      wView.enabled('gallery') && (w.gallery ?? []).length > 0
        ? `${galleryHeading === null ? '' : `<h2 class="section-title">${escapeHtml(galleryHeading)}</h2>`}<div class="gallery">${(w.gallery ?? [])
            .filter((g) => g?.url)
            .map(
              (g) =>
                `<figure><img src="${escapeHtml(img(g.url))}" alt="" loading="lazy">${
                  g.caption ? `<figcaption>${escapeHtml(g.caption)}</figcaption>` : ''
                }</figure>`,
            )
            .join('')}</div>`
        : ''
    const contentChunks = [
      { order: wView.order('body'), html: doc(hasRichText(w.document) ? w.document : w.content) },
      { order: wView.order('gallery'), html: galleryChunk },
    ].filter((chunk) => chunk.html !== '')

    return `
      <a class="crumb" href="#/world">← 词条</a>
      ${w.cover ? `<img class="entry-cover" src="${escapeHtml(img(w.cover))}" alt="">` : ''}
      <h1 class="page-title">${escapeHtml(w.title || '未命名')}</h1>
      ${w.summary ? `<p class="page-sub">${escapeHtml(w.summary)}</p>` : ''}
      <div class="fields">
        ${parent ? fieldRow('上级', `<a class="ref" href="#/world/${parent.id}">${escapeHtml(parent.title || '未命名')}</a>`) : ''}
        ${w.aliases?.length ? fieldRow('别名', escapeHtml(w.aliases.join('、'))) : ''}
        ${w.category ? fieldRow('分类', escapeHtml(w.category)) : ''}
        ${w.time ? fieldRow('时间', escapeHtml(timeLabel(w.time, w.endTime))) : ''}
        ${w.location ? fieldRow('地点', escapeHtml(w.location)) : ''}
        ${Object.entries(w.custom ?? {})
          .filter(([, value]) => value.trim() !== '')
          .map(([label, value]) => fieldRow(escapeHtml(label), escapeHtml(value)))
          .join('')}
        ${fieldRow('标签', tagChips(w.tags))}
        ${manualRefs.length > 0 ? fieldRow(wView.label('relations', '关系'), manualRefs.join('、')) : ''}
        ${fieldRow('引用', refs.join('、'))}
      </div>
      ${joinByTemplateOrder(contentChunks)}
    `
  })

  // ── 关系 ──────────────────────────────────────────────────────────

  const seenRelations = new Set<string>()
  const characterRelations = data.characters.flatMap((c) =>
    c.relatedCharacters.map((r) => ({
      from: c.name,
      fromId: c.id,
      relation: r.relation,
      to: r.name,
      toId: r.characterId ?? null,
    })),
  ).filter((row) => {
    // 双方各存一次是现状；同一对只画一行（与关系图「同一对去重」同一口径）
    const pair = row.toId !== null
      ? [row.fromId, row.toId].sort((a, b) => a - b).join(':')
      : [row.from, row.to].sort((a, b) => a.localeCompare(b, 'zh-Hans')).join(':')
    if (seenRelations.has(pair)) return false
    seenRelations.add(pair)
    return true
  })

  const relations = `
    <h1 class="page-title">关系</h1>
    ${
      characterRelations.length > 0
        ? `<h2 class="section-title">角色之间</h2>
           <table class="rel-table"><thead><tr><th>角色</th><th>关系</th><th>角色</th></tr></thead><tbody>
           ${characterRelations
             .map(
               (r) =>
                 `<tr><td>${refLink('character', r.fromId, r.from)}</td><td>${escapeHtml(r.relation)}</td><td>${
                   r.toId ? refLink('character', r.toId, r.to) : escapeHtml(r.to)
                 }</td></tr>`,
             )
             .join('')}
           </tbody></table>`
        : ''
    }
    ${
      data.events.some((e) => (e.relations ?? []).length > 0)
        ? `<h2 class="section-title">事件之间</h2>
           <table class="rel-table"><thead><tr><th>事件</th><th>关系</th><th>事件</th></tr></thead><tbody>
           ${data.events
             .flatMap((e) =>
               (e.relations ?? []).map((r) => {
                 const target = eventsById.get(r.targetId)
                 return target
                   ? `<tr><td>${refLink('event', e.id, e.title)}</td><td>${escapeHtml(r.relation)}</td><td>${refLink('event', target.id, target.title)}</td></tr>`
                   : ''
               }),
             )
             .filter(Boolean)
             .join('')}
           </tbody></table>`
        : ''
    }
    ${
      data.events.some((e) => (e.characters ?? []).length > 0)
        ? `<h2 class="section-title">事件参与</h2>
           <table class="rel-table"><thead><tr><th>事件</th><th>时间</th><th>参与角色</th></tr></thead><tbody>
           ${data.events
             .filter((e) => (e.characters ?? []).length > 0)
             .map((e) => {
               const people = (e.characters ?? [])
                 .map((id) => charactersById.get(id))
                 .filter((c): c is Character => Boolean(c))
               return `<tr><td>${refLink('event', e.id, e.title)}</td><td>${escapeHtml(timeLabel(e.time, e.endTime))}</td><td>${people
                 .map((p) => refLink('character', p.id, p.name))
                 .join('、')}</td></tr>`
             })
             .join('')}
           </tbody></table>`
        : ''
    }
    ${characterRelations.length === 0 && !data.events.some((e) => (e.relations ?? []).length > 0) && !data.events.some((e) => (e.characters ?? []).length > 0) ? '<div class="empty">还没有关系数据</div>' : ''}
  `

  // ── 组装 ──────────────────────────────────────────────────────────

  const navItems: { key: string; label: string; count?: number }[] = [
    { key: 'home', label: '概览' },
    { key: 'timeline', label: '时间线' },
    { key: 'characters', label: '角色', count: data.characters.length },
    { key: 'events', label: '事件', count: data.events.length },
    { key: 'countries', label: '国家', count: data.countries.length },
    { key: 'world', label: '词条', count: data.worldEntries.length },
    { key: 'relations', label: '关系' },
  ].filter((item) => {
    if (item.key === 'home') return true
    if (item.key === 'timeline') return enabled.timeline
    if (item.key === 'characters') return enabled.characters
    if (item.key === 'events') return enabled.events
    if (item.key === 'countries') return enabled.countries
    if (item.key === 'world') return enabled.world
    return enabled.relations
  })

  const page = (route: string, html: string): string => `<section class="page" data-route="${route}">${html}</section>`

  const pageMarkup = [
    page('home', home),
    ...(enabled.timeline ? [page('timeline', timeline)] : []),
    ...(enabled.characters
      ? [
          page('characters', charactersList),
          ...characterDetails.map((html, index) => page(`characters/${sortedCharacters[index].id}`, html)),
        ]
      : []),
    ...(enabled.events
      ? [
          page('events', eventsList),
          ...eventDetails.map((html, index) => page(`events/${data.events[index].id}`, html)),
        ]
      : []),
    ...(enabled.countries
      ? [
          page('countries', countriesList),
          ...countryDetails.map((html, index) => page(`countries/${data.countries[index].id}`, html)),
        ]
      : []),
    ...(enabled.world
      ? [
          page('world', worldList),
          ...worldDetails.map((html, index) => page(`world/${data.worldEntries[index].id}`, html)),
        ]
      : []),
    ...(enabled.relations ? [page('relations', relations)] : []),
  ].join('\n')

  const themeStyle = options.theme
    ? `:root {
  --paper: ${escapeHtml(options.theme.paper)};
  --paper-alt: ${escapeHtml(options.theme.paperAlt)};
  --paper-card: ${escapeHtml(options.theme.paperCard)};
  --line: ${escapeHtml(options.theme.line)};
  --line-hover: ${escapeHtml(options.theme.lineHover)};
  --ink: ${escapeHtml(options.theme.ink)};
  --ink-muted: ${escapeHtml(options.theme.inkMuted)};
  --ink-faint: ${escapeHtml(options.theme.inkFaint)};
  --hover: ${escapeHtml(options.theme.hover)};
}`
    : ''

  const navMarkup = navItems
    .map(
      (item) =>
        `<a href="#/${item.key === 'home' ? '' : item.key}" data-nav="${item.key}"><span>${escapeHtml(item.label)}</span>${
          item.count !== undefined ? `<span class="count">${item.count}</span>` : ''
        }</a>`,
    )
    .join('')

  const brandMarkup = `<a class="brand" href="#/">
      <div class="world">${escapeHtml(siteTitle)}</div>
      ${tagline ? `<div class="tagline">${escapeHtml(tagline)}</div>` : ''}
    </a>`

  // 外壳只有两种：侧栏（书斋）与顶栏（档案 / 画廊）。版式 CSS 按 body[data-template] 接管。
  const shellMarkup =
    template.shell === 'topbar'
      ? `<header class="topbar">
    ${brandMarkup}
    <nav class="nav">${navMarkup}</nav>
  </header>`
      : `<aside class="sidebar">
    ${brandMarkup}
    <nav class="nav">${navMarkup}</nav>
  </aside>`

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(siteTitle)}</title>
<meta name="description" content="${escapeHtml(tagline || `${siteTitle} — 世界观设定集`)}">
<style>
${SITE_CSS}
${template.css}
${themeStyle}
</style>
</head>
<body data-template="${template.id}">
<div class="layout">
  ${shellMarkup}
  <main class="main">
${pageMarkup}
    <div class="footer">由 OC Studio 导出 · ${escapeHtml(dateLabel(Date.now()))}</div>
  </main>
</div>
<script>
(function () {
  var siteTitle = ${scriptJson(siteTitle)};
  var pages = {};
  var nodes = document.querySelectorAll('[data-route]');
  for (var i = 0; i < nodes.length; i++) pages[nodes[i].getAttribute('data-route')] = nodes[i];
  function show() {
    var key = (location.hash || '').replace(/^#\\/?/, '');
    if (key === '' || key === '/') key = 'home';
    var target = pages[key] || pages[key.split('/')[0]] || pages['home'];
    for (var k in pages) pages[k].hidden = pages[k] !== target;
    var navKey = key.split('/')[0];
    var links = document.querySelectorAll('[data-nav]');
    for (var j = 0; j < links.length; j++) {
      var on = links[j].getAttribute('data-nav') === navKey;
      if (on) links[j].classList.add('on'); else links[j].classList.remove('on');
    }
    if (navKey === 'home') links[0].classList.add('on');
    window.scrollTo(0, 0);
    var heading = target.querySelector('.page-title');
    var headingText = heading ? heading.textContent : '';
    document.title = headingText && headingText !== siteTitle ? headingText + ' — ' + siteTitle : siteTitle;
  }
  window.addEventListener('hashchange', show);
  show();
})();
</script>
</body>
</html>`
}

/** 正文里出现的所有图片 src（含正文图块），用于提前内联成 data URI。 */
export function collectSiteImages(data: SiteData): string[] {
  const urls = new Set<string>()
  const push = (value: string | undefined): void => {
    if (value && !value.startsWith('data:')) urls.add(value)
  }
  for (const c of data.characters) {
    push(c.avatarUrl); push(c.headerUrl)
    for (const g of c.gallery) push(g.url)
    for (const a of c.avatars) push(a.url)
  }
  for (const e of data.events) {
    push(e.headerUrl)
    for (const g of e.images ?? []) push(g.url)
  }
  for (const c of data.countries) { push(c.flagUrl); push(c.headerUrl) }
  push(data.meta?.coverUrl)
  for (const entry of data.worldEntries) push(entry.cover)

  const bodies: unknown[] = [
    ...data.characters.map((c) => c.document),
    ...data.events.map((e) => e.document),
    ...data.countries.map((c) => c.document),
    ...data.worldEntries.map((w) => worldBodyOf(w)),
  ]
  for (const body of bodies) {
    for (const src of collectDocImages(body)) push(src)
  }
  return [...urls]
}
