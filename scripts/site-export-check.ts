/**
 * 静态站导出逻辑自检：`npx tsx scripts/site-export-check.ts`
 *
 * 不打开浏览器，只拿一份最小数据集跑 `buildSite`，然后对生成的单文件 HTML 做断言。
 * 覆盖三类**曾经会出错**的地方：
 * 1. 角色详情页的路由必须按列表排序后的 id 生成（否则点 A 打开 B）
 * 2. 只有结束时间时不能渲染成「 ~ 2020」
 * 3. 导出日期按本地日历，不用 `toISOString()`（东八区凌晨会少一天）
 */
import { buildSite, dateLabel, timeLabel, type SiteData } from '../src/lib/export/site/build'
import { SITE_TEMPLATES, siteTemplateOf } from '../src/lib/export/site/templates'
import type { Character, Country, Event, Period, ProjectMeta, Tag, WorldEntry } from '../src/types'

let passed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1
    return
  }
  failures.push(detail ? `${name}：${detail}` : name)
}

function character(input: Partial<Character> & Pick<Character, 'id' | 'name'>): Character {
  return {
    aliases: [],
    race: '',
    element: '',
    occupation: '',
    faction: '',
    nationalityLegacy: '',
    height: '',
    birthday: '',
    avatarUrl: '',
    bio: '',
    lifeStory: '',
    relatedCharacters: [],
    gallery: [],
    avatars: [],
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    _syncStatus: 'synced',
    _lastModified: 0,
    ...input,
  }
}

function event(input: Partial<Event> & Pick<Event, 'id' | 'title'>): Event {
  return {
    aliases: [],
    time: '',
    endTime: '',
    location: '',
    summary: '',
    content: '',
    characters: [],
    countries: [],
    relations: [],
    images: [],
    tags: [],
    isMajor: false,
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    _syncStatus: 'synced',
    _lastModified: 0,
    parentEventId: null,
    ...input,
  }
}

function country(input: Partial<Country> & Pick<Country, 'id' | 'name'>): Country {
  return {
    aliases: [],
    description: '',
    system: '',
    geography: '',
    culture: '',
    flagUrl: '',
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    _syncStatus: 'synced',
    _lastModified: 0,
    parentId: null,
    ...input,
  }
}

function worldEntry(input: Partial<WorldEntry> & Pick<WorldEntry, 'id' | 'title'>): WorldEntry {
  return {
    aliases: [],
    content: '',
    parentId: null,
    order: 0,
    isConcept: false,
    relations: [],
    references: [],
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    _syncStatus: 'synced',
    _lastModified: 0,
    category: '',
    ...input,
  }
}

const data: SiteData = {
  meta: { worldName: '测试世界', tagline: '' } as ProjectMeta,
  characters: [
    character({
      id: 7,
      name: '乙',
      relatedCharacters: [{ characterId: 3, name: '甲', relation: '同伴' }],
    }),
    character({
      id: 3,
      name: '甲',
      isMajor: true,
      relatedCharacters: [{ characterId: 7, name: '乙', relation: '同伴' }],
    }),
  ],
  events: [event({ id: 1, title: '只有结束时间', endTime: '2020' })],
  countries: [country({ id: 1, name: '测试国' })],
  worldEntries: [
    worldEntry({
      id: 1,
      title: '指向未知类型',
      cover: '附件/封面.png',
      summary: '一句简介',
      category: '宠物',
      custom: { 物种: '风灵', 习性: '夜行' },
      references: [{ targetType: 'mystery', targetId: 1 }],
    }),
  ],
  tags: [] as Tag[],
  periods: [] as Period[],
}

const html = buildSite(data, { images: new Map() })

// ── 1. 角色详情页与路由对齐 ───────────────────────────────────────────
const pages = new Map<string, string>()
for (const match of html.matchAll(/<section class="page" data-route="([^"]+)">([\s\S]*?)<\/section>/g)) {
  pages.set(match[1], match[2])
}
for (const person of data.characters) {
  const page = pages.get(`characters/${person.id}`)
  check(`角色 ${person.name} 的详情页存在`, Boolean(page))
  check(
    `角色 ${person.name} 的路由打开的是本人`,
    Boolean(page?.includes(`<h1 class="page-title">${person.name}</h1>`)),
    page ? '页面标题与路由不匹配' : '缺页',
  )
}

const relationsPage = pages.get('relations') ?? ''
check('双向关系只输出一行', (relationsPage.match(/同伴/g) ?? []).length === 1, '同一对被画了两次')

// ── 2. 只有结束时间 ──────────────────────────────────────────────────
check('只有结束时间时不出现前导波浪号', !html.includes('~ 2020'), '渲染成了「 ~ 2020」')
check('只有结束时间时仍显示结束时间', html.includes('2020'))
check('只有结束时间（纯函数）', timeLabel('', '2020') === '2020', timeLabel('', '2020'))

// ── 3. 本地日期 ────────────────────────────────────────────────────
const nearMidnight = new Date(2026, 0, 2, 0, 30).getTime()
const expected = `${new Date(nearMidnight).getFullYear()}-01-02`
check('导出日期按本地日历', dateLabel(nearMidnight) === expected, dateLabel(nearMidnight))
check('空日期不输出', dateLabel(undefined) === '')

// ── 4. 未知引用类型不生成 #/undefined ───────────────────────────────
check('未知引用类型不生成 /undefined 路由', !html.includes('#/undefined/'), '出现 #/undefined/')

const worldPage = pages.get('world/1') ?? ''
check('词条详情页输出封面', worldPage.includes('class="entry-cover"'))
check('词条详情页输出简介', worldPage.includes('一句简介'))
check('词条详情页输出自定义字段', worldPage.includes('物种') && worldPage.includes('风灵'))
check('分类条目输出分类名', worldPage.includes('分类') && worldPage.includes('宠物'))

// ── 5. 分区开关 ──────────────────────────────────────────────────
const charactersOff = buildSite(data, { images: new Map(), sections: { characters: false } })
check('关掉角色分区后不生成角色页', !charactersOff.includes('data-route="characters"'))
check('关掉角色分区后导航里没有角色', !charactersOff.includes('data-nav="characters"'))
check('关掉角色分区后不再链接到角色页', !charactersOff.includes('href="#/characters'))
check('关掉角色分区后其它分区仍然存在', charactersOff.includes('data-route="events"') && charactersOff.includes('data-route="world"'))

// ── 6. 标题与纸色覆盖 ─────────────────────────────────────────────
const titled = buildSite(data, {
  images: new Map(),
  title: '我的设定集',
  theme: {
    paper: '#123456',
    paperAlt: '#123457',
    paperCard: '#123458',
    line: '#123459',
    lineHover: '#12345A',
    ink: '#12345B',
    inkMuted: '#12345C',
    inkFaint: '#12345D',
    hover: 'rgba(18, 52, 86, 0.05)',
  },
})
check('站点标题写进 <title>', titled.includes('<title>我的设定集</title>'))
check('站点标题写进侧栏', titled.includes('<div class="world">我的设定集</div>'))
check('固定纸色覆盖写在样式表之后', titled.includes('--paper: #123456;'))

// 标题里的 `</script>` 不能把页面脚本截断
const dangerous = buildSite(data, { images: new Map(), title: 'A</script><script>alert(1)</script>B' })
check('标题里的 </script> 被转义', !dangerous.includes('A</script><script>alert(1)</script>B'))
check('标题本体仍然可见', dangerous.includes('<title>A&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;B</title>'))

// 早期 HTML 正文不能被当成字面量画出来
const htmlBody = buildSite(
  {
    ...data,
    characters: [
      character({
        id: 9,
        name: 'HTML 正文',
        document: '<blockquote><p><em>这是一段引用</em></p></blockquote>',
      }),
    ],
    events: [],
    countries: [],
    worldEntries: [],
  },
  { images: new Map() },
)
check('HTML 正文被转成文本', htmlBody.includes('这是一段引用'))
check('HTML 正文不出现原始 blockquote 标签', !htmlBody.includes('<blockquote>'))
check('HTML 正文不出现转义标签文本', !htmlBody.includes('&lt;blockquote'))

// ── 7. 版式（书斋 / 档案 / 画廊） ─────────────────────────────────────
check('至少三套版式', SITE_TEMPLATES.length >= 3)
for (const template of SITE_TEMPLATES) {
  const output = buildSite(data, { images: new Map(), template: template.id })
  check(`版式 ${template.id}：body 带 data-template`, output.includes(`<body data-template="${template.id}">`))
  check(`版式 ${template.id}：CSS 真的被内联`, output.includes(`body[data-template="${template.id}"]`))
  if (template.shell === 'topbar') {
    check(`版式 ${template.id}：顶栏渲染`, output.includes('<header class="topbar">'))
    check(`版式 ${template.id}：不渲染侧栏`, !output.includes('<aside class="sidebar">'))
  } else {
    check(`版式 ${template.id}：侧栏渲染`, output.includes('<aside class="sidebar">'))
    check(`版式 ${template.id}：不渲染顶栏`, !output.includes('<header class="topbar">'))
  }
  check(`版式 ${template.id}：导航仍然有链接`, output.includes('data-nav="characters"'))
}
check('未知版式回落到书斋', siteTemplateOf('不存在的版式').id === 'book')
const unknownTemplate = buildSite(data, { images: new Map(), template: '不存在的版式' as never })
check('未知版式生成的是书斋', unknownTemplate.includes('<body data-template="book">'))

// 纸色覆盖必须排在版式 CSS 之后，否则模板里的令牌会盖掉用户选的纸色
const zz = buildSite(data, {
  images: new Map(),
  template: 'archive',
  theme: {
    paper: '#111111',
    paperAlt: '#111112',
    paperCard: '#111113',
    line: '#111114',
    lineHover: '#111115',
    ink: '#111116',
    inkMuted: '#111117',
    inkFaint: '#111118',
    hover: 'rgba(17, 17, 17, 0.05)',
  },
})
check(
  '固定纸色排在版式 CSS 之后',
  zz.indexOf('--paper: #111111;') > zz.indexOf('body[data-template="archive"]'),
  '纸色被版式令牌盖住了',
)

if (failures.length > 0) {
  console.error('静态站导出自检失败：')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(`静态站导出自检通过：${passed} 项断言（角色路由 / 只有结束时间 / 本地日期 / 未知引用 / 分区开关 / 标题与纸色 / 三套版式）`)
