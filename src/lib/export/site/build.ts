import type { Character, Country, Event, Period, ProjectMeta, Tag, WorldEntry } from '@/types'
import { buildEntryTree, type WorldTreeNode } from '@/lib/world-tree'
import { collectDocImages, escapeHtml, hasRichText, plainTextOf, renderRichText, type RenderOptions } from './render'
import { SITE_CSS } from './styles'

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

export interface BuildOptions {
  /** 图片 src → data URI；未命中的保持原样 */
  images: Map<string, string>
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

function timeLabel(time: string | undefined, endTime?: string): string {
  const start = (time ?? '').trim()
  const end = (endTime ?? '').trim()
  if (!start && !end) return '未定年'
  return end && end !== start ? `${start} ~ ${end}` : start
}

function dateLabel(ms: number | undefined): string {
  if (!ms || !Number.isFinite(ms)) return ''
  return new Date(ms).toISOString().slice(0, 10)
}

function shortText(value: unknown, max = 90): string {
  const text = plainTextOf(value).replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function fieldValue(...parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.trim() !== '').join('')
}

// ── 构建器 ────────────────────────────────────────────────────────────

export function buildSite(data: SiteData, options: BuildOptions): string {
  const { images } = options

  const charactersById = new Map(data.characters.map((c) => [c.id, c]))
  const eventsById = new Map(data.events.map((e) => [e.id, e]))
  const countriesById = new Map(data.countries.map((c) => [c.id, c]))
  const worldById = new Map(data.worldEntries.map((w) => [w.id, w]))
  const tagsById = new Map(data.tags.map((t) => [t.id, t]))

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

  const refLink = (kind: string, id: number, label: string): string =>
    exists(kind, id)
      ? `<a class="ref" href="#/${ROUTE_BY_KIND[kind]}/${id}">${escapeHtml(label)}</a>`
      : `<span>${escapeHtml(label)}</span>`

  // ── 概览 ──────────────────────────────────────────────────────────

  const worldName = (data.meta?.worldName ?? '').trim() || 'OC Studio'
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

  const home = `
    ${cover ? `<img class="cover" src="${escapeHtml(cover)}" alt="">` : ''}
    <h1 class="page-title">${escapeHtml(worldName)}</h1>
    ${tagline ? `<p class="page-sub">${escapeHtml(tagline)}</p>` : ''}
    <div class="stats">
      <a class="stat" href="#/characters"><div class="num">${data.characters.length}</div><div class="label">角色</div></a>
      <a class="stat" href="#/events"><div class="num">${data.events.length}</div><div class="label">事件</div></a>
      <a class="stat" href="#/countries"><div class="num">${data.countries.length}</div><div class="label">国家</div></a>
      <a class="stat" href="#/world"><div class="num">${data.worldEntries.length}</div><div class="label">词条</div></a>
    </div>
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
        ? `<div class="rows">${sortedEvents.map((e) => eventRow(e)).join('')}</div>`
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

  const characterDetails = data.characters.map((c) => {
    const country = c.countryId ? countriesById.get(c.countryId) : undefined
    const relatedEvents = data.events.filter((e) => (e.characters ?? []).includes(c.id))
    const body = hasRichText(c.document) ? c.document : `${c.bio}\n\n${c.lifeStory}`
    const gallery = [...c.gallery, ...c.avatars].filter((g) => g?.url)

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
      ${doc(body)}
      ${
        gallery.length > 0
          ? `<h2 class="section-title">图集</h2><div class="gallery">${gallery
              .map(
                (g) => `<figure><img src="${escapeHtml(img(g.url))}" alt="" loading="lazy">${
                  'caption' in g && g.caption ? `<figcaption>${escapeHtml(g.caption)}</figcaption>` : ''
                }</figure>`,
              )
              .join('')}</div>`
          : ''
      }
      ${
        c.relatedCharacters.length > 0
          ? `<h2 class="section-title">相关角色</h2>
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
          : ''
      }
      ${
        relatedEvents.length > 0
          ? `<h2 class="section-title">相关事件</h2>
             <div class="rows">${relatedEvents.map((e) => eventRow(e)).join('')}</div>`
          : ''
      }
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
    const gallery = (e.images ?? []).filter((g) => g?.url)

    return `
      <a class="crumb" href="#/events">← 事件</a>
      ${img(e.headerUrl) ? `<img class="banner" src="${escapeHtml(img(e.headerUrl))}" alt="">` : ''}
      <h1 class="page-title">${escapeHtml(e.title || '未命名')}${e.isMajor ? ' ★' : ''}</h1>
      <div class="fields">
        ${fieldRow('时间', escapeHtml(timeLabel(e.time, e.endTime)))}
        ${fieldRow('地点', escapeHtml(e.location))}
        ${fieldRow('参与角色', people.map((p) => refLink('character', p.id, p.name)).join('、'))}
        ${fieldRow('相关国家', lands.map((l) => refLink('country', l.id, l.name)).join('、'))}
        ${fieldRow('相关事件', links.map((l) => refLink('event', l.id, l.title)).join('、'))}
        ${fieldRow('标签', tagChips(e.tags))}
      </div>
      ${doc(body)}
      ${
        gallery.length > 0
          ? `<h2 class="section-title">图集</h2><div class="gallery">${gallery
              .map(
                (g) => `<figure><img src="${escapeHtml(img(g.url))}" alt="" loading="lazy">${
                  g.caption ? `<figcaption>${escapeHtml(g.caption)}</figcaption>` : ''
                }</figure>`,
              )
              .join('')}</div>`
          : ''
      }
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
    const people = (c.characters ?? []).map((id) => charactersById.get(id)).filter((x): x is Character => Boolean(x))
    const lands = (c.events ?? []).map((id) => eventsById.get(id)).filter((x): x is Event => Boolean(x))
    const body = hasRichText(c.document) ? c.document : [c.description, c.system, c.geography, c.culture].join('\n\n')

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
        ${fieldRow('标签', tagChips(c.tags))}
      </div>
      ${doc(body)}
      ${
        people.length > 0
          ? `<h2 class="section-title">人物</h2><div class="rows">${people
              .map(
                (p) => `<a class="row" href="#/characters/${p.id}"><div class="when"></div><div class="body"><div class="title">${escapeHtml(p.name)}</div></div></a>`,
              )
              .join('')}</div>`
          : ''
      }
      ${
        lands.length > 0
          ? `<h2 class="section-title">相关事件</h2><div class="rows">${lands.map((e) => eventRow(e)).join('')}</div>`
          : ''
      }
    `
  })

  // ── 词条 ──────────────────────────────────────────────────────────
  // 章节按**词条树**分（`parentId`）：有子项的一级词条当章节标题，子孙按深度缩进。
  // 以前那个凭 `category` 自由文本分组的做法已经删了 —— 它跟树完全无关。
  const worldTree = buildEntryTree(data.worldEntries)

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

    return `
      <a class="crumb" href="#/world">← 词条</a>
      <h1 class="page-title">${escapeHtml(w.title || '未命名')}</h1>
      <div class="fields">
        ${parent ? fieldRow('上级', `<a class="ref" href="#/world/${parent.id}">${escapeHtml(parent.title || '未命名')}</a>`) : ''}
        ${w.aliases?.length ? fieldRow('别名', escapeHtml(w.aliases.join('、'))) : ''}
        ${fieldRow('标签', tagChips(w.tags))}
        ${fieldRow('引用', refs.join('、'))}
      </div>
      ${doc(hasRichText(w.document) ? w.document : w.content)}
    `
  })

  // ── 关系 ──────────────────────────────────────────────────────────

  const characterRelations = data.characters.flatMap((c) =>
    c.relatedCharacters.map((r) => ({
      from: c.name,
      fromId: c.id,
      relation: r.relation,
      to: r.name,
      toId: r.characterId ?? null,
    })),
  )

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
  ]

  const page = (route: string, html: string): string => `<section class="page" data-route="${route}">${html}</section>`

  const sections = [
    page('home', home),
    page('timeline', timeline),
    page('characters', charactersList),
    ...characterDetails.map((html, index) => page(`characters/${sortedCharacters[index].id}`, html)),
    page('events', eventsList),
    ...eventDetails.map((html, index) => page(`events/${data.events[index].id}`, html)),
    page('countries', countriesList),
    ...countryDetails.map((html, index) => page(`countries/${data.countries[index].id}`, html)),
    page('world', worldList),
    ...worldDetails.map((html, index) => page(`world/${data.worldEntries[index].id}`, html)),
    page('relations', relations),
  ].join('\n')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(worldName)}</title>
<meta name="description" content="${escapeHtml(tagline || `${worldName} — 世界观设定集`)}">
<style>
${SITE_CSS}
</style>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <a class="brand" href="#/">
      <div class="world">${escapeHtml(worldName)}</div>
      ${tagline ? `<div class="tagline">${escapeHtml(tagline)}</div>` : ''}
    </a>
    <nav class="nav">
      ${navItems
        .map(
          (item) =>
            `<a href="#/${item.key === 'home' ? '' : item.key}" data-nav="${item.key}"><span>${escapeHtml(item.label)}</span>${
              item.count !== undefined ? `<span class="count">${item.count}</span>` : ''
            }</a>`,
        )
        .join('')}
    </nav>
  </aside>
  <main class="main">
${sections}
    <div class="footer">由 OC Studio 导出 · ${escapeHtml(dateLabel(Date.now()))}</div>
  </main>
</div>
<script>
(function () {
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
    document.title = (target.querySelector('.page-title') ? target.querySelector('.page-title').textContent + ' — ' : '') + ${JSON.stringify(worldName)};
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

  const bodies: unknown[] = [
    ...data.characters.map((c) => c.document),
    ...data.events.map((e) => e.document),
    ...data.countries.map((c) => c.document),
    ...data.worldEntries.map((w) => w.document ?? w.content),
  ]
  for (const body of bodies) {
    for (const src of collectDocImages(body)) push(src)
  }
  return [...urls]
}
