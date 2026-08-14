'use client'

import { useEffect } from 'react'
import { notifyDataUpdated } from '@/lib/data-events'

function svgUrl(svg: string): string {
  return 'data:image/svg+xml,' + encodeURIComponent(svg.trim())
}

// ============================================================
// 示例文本
// ============================================================
const SAMPLE_TEXT_INTRO = '这是一段示例文本'
const SAMPLE_TEXT_P1 = '小车正穿行在落基山脉蜿蜒曲折的盘山公路上,克利斯朵夫·李维静静地望着窗外,发现每当车子即将行驶到无路的当口,路边都会出现一块交通指示牌:"前方转弯!"或"注意!急转弯",而拐过每一道弯之后,前方照例又是一片柳暗花明,豁然开朗。'
const SAMPLE_TEXT_P2 = '山路弯弯,峰回路转。前方转弯几个大字一次次地冲击着他的眼球,也渐渐扣开了他的心扉,原来不是路已到了尽头,而是该转弯了。'
const SAMPLE_TEXT_P3 = '路在脚下,更在心中;心随路转,心路常宽。学会转弯也是人生的智慧,因为挫折往往是转折,危机同时是转机。'

const SAMPLE_HTML = `<blockquote><p><em>${SAMPLE_TEXT_INTRO}</em></p></blockquote><p>${SAMPLE_TEXT_P1}</p><p>${SAMPLE_TEXT_P2}</p><p>${SAMPLE_TEXT_P3}</p>`

// ============================================================
// SVG 生成辅助函数
// ============================================================
function makeAvatar(color: string): string {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="100" fill="${color}"/><circle cx="100" cy="76" r="30" fill="white" opacity="0.9"/><ellipse cx="100" cy="152" rx="50" ry="38" fill="white" opacity="0.9"/></svg>`)
}

function makeQAvatar(color: string): string {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="96" fill="${color}" stroke="white" stroke-width="8"/><circle cx="100" cy="80" r="26" fill="white" opacity="0.85"/><path d="M60 118L140 118L148 180L52 180Z" fill="white" opacity="0.85"/></svg>`)
}

function makePortrait(color: string): string {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="240"><rect width="120" height="240" rx="6" fill="#F5F2ED"/><circle cx="60" cy="48" r="22" fill="${color}"/><path d="M36 78L84 78L90 148L30 148Z" fill="${color}"/><line x1="38" y1="148" x2="26" y2="210" stroke="${color}" stroke-width="5" stroke-linecap="round"/><line x1="82" y1="148" x2="94" y2="210" stroke="${color}" stroke-width="5" stroke-linecap="round"/></svg>`)
}

function makeHeader(color1: string, color2: string): string {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${color1}"/><stop offset="100%" stop-color="${color2}"/></linearGradient></defs><rect width="800" height="300" fill="url(#g)"/></svg>`)
}

function makeGalleryImage(color1: string, color2: string, angle: string): string {
  const x1 = angle === 'v' ? '0%' : '0%'
  const y1 = angle === 'h' ? '0%' : '0%'
  const x2 = angle === 'v' ? '0%' : '100%'
  const y2 = angle === 'h' ? '100%' : '100%'
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0%" stop-color="${color1}"/><stop offset="100%" stop-color="${color2}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/></svg>`)
}

function makeFlag(color: string): string {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect x="12" y="24" width="96" height="72" rx="8" fill="#F5F2ED"/><polygon points="60,38 98,82 22,82" fill="${color}"/></svg>`)
}

// ============================================================
// 角色 A — 暖橙珊瑚色系 #E8744B
// ============================================================
const COLOR_A = '#E8744B'

const CHAR_A_AVATAR = makeAvatar(COLOR_A)
const CHAR_A_QAVATAR = makeQAvatar(COLOR_A)
const CHAR_A_PORTRAIT1 = makePortrait(COLOR_A)
const CHAR_A_PORTRAIT2 = makePortrait('#C0603A')
const CHAR_A_HEADER = makeHeader(COLOR_A, '#F0A880')
const CHAR_A_GALLERY = [
  { url: makeGalleryImage(COLOR_A, '#F0C8A0', 'd'), caption: '' },
  { url: makeGalleryImage('#F0A880', COLOR_A, 'h'), caption: '' },
  { url: makeGalleryImage('#FFD4B8', COLOR_A, 'v'), caption: '' },
  { url: makeGalleryImage(COLOR_A, '#FFE0CC', 'd'), caption: '' },
]

// ============================================================
// 角色 B — 蓝紫色系 #6C5CE7
// ============================================================
const COLOR_B = '#6C5CE7'

const CHAR_B_AVATAR = makeAvatar(COLOR_B)
const CHAR_B_QAVATAR = makeQAvatar(COLOR_B)
const CHAR_B_PORTRAIT1 = makePortrait(COLOR_B)
const CHAR_B_PORTRAIT2 = makePortrait('#5849C2')
const CHAR_B_HEADER = makeHeader(COLOR_B, '#A29BFE')
const CHAR_B_GALLERY = [
  { url: makeGalleryImage(COLOR_B, '#A29BFE', 'd'), caption: '' },
  { url: makeGalleryImage('#8175E0', COLOR_B, 'h'), caption: '' },
  { url: makeGalleryImage('#C8C0FF', COLOR_B, 'v'), caption: '' },
  { url: makeGalleryImage(COLOR_B, '#DFDAFF', 'd'), caption: '' },
]

// ============================================================
// 角色 C — 翠绿色系 #00B894
// ============================================================
const COLOR_C = '#00B894'

const CHAR_C_AVATAR = makeAvatar(COLOR_C)
const CHAR_C_QAVATAR = makeQAvatar(COLOR_C)
const CHAR_C_PORTRAIT1 = makePortrait(COLOR_C)
const CHAR_C_PORTRAIT2 = makePortrait('#00A381')
const CHAR_C_HEADER = makeHeader(COLOR_C, '#55EFC4')
const CHAR_C_GALLERY = [
  { url: makeGalleryImage(COLOR_C, '#55EFC4', 'd'), caption: '' },
  { url: makeGalleryImage('#00D2A0', COLOR_C, 'h'), caption: '' },
  { url: makeGalleryImage('#88FFD8', COLOR_C, 'v'), caption: '' },
  { url: makeGalleryImage(COLOR_C, '#BBFFEC', 'd'), caption: '' },
]

// ============================================================
// 国家图片
// ============================================================
// 晨曦共和国 — 暖黄色系
const COUNTRY1_FLAG = makeFlag('#E8A830')
const COUNTRY1_HEADER = makeHeader('#F0C860', '#E8A830')

// 暮光联邦 — 深蓝紫系
const COUNTRY2_FLAG = makeFlag('#4A5BC6')
const COUNTRY2_HEADER = makeHeader('#3D3680', '#5B6ED4')

// ============================================================
// 事件图片
// ============================================================
const EVENT1_HEADER = makeHeader('#E8744B', '#6C5CE7')
const EVENT1_IMAGE1 = makeGalleryImage('#E8744B', '#D4A574', 'd')
const EVENT1_IMAGE2 = makeGalleryImage('#6C5CE7', '#E8744B', 'h')

const EVENT2_HEADER = makeHeader('#6C5CE7', '#00B894')
const EVENT2_IMAGE1 = makeGalleryImage('#6C5CE7', '#A29BFE', 'd')
const EVENT2_IMAGE2 = makeGalleryImage('#00B894', '#6C5CE7', 'h')

// ============================================================
// SeedData 组件
// ============================================================
export function SeedData() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const seed = async () => {
      const { db } = await import('@/lib/db')
      const count = await db.characters.count()
      if (count > 0) return

      // --- 角色 A ---
      const charAId = await db.characters.add({
        name: '示例角色A',
        aliases: ['烈焰使者'],
        race: '人类',
        element: '火',
        occupation: '冒险者',
        nationalityLegacy: '晨曦共和国',
        height: '175cm',
        birthday: '',
        avatarUrl: CHAR_A_AVATAR,
        qAvatarUrl: CHAR_A_QAVATAR,
        avatars: [
          { url: CHAR_A_PORTRAIT1, type: 'portrait' },
          { url: CHAR_A_PORTRAIT2, type: 'portrait' },
        ],
        gallery: CHAR_A_GALLERY,
        headerUrl: CHAR_A_HEADER,
        bio: SAMPLE_HTML,
        lifeStory: SAMPLE_HTML,
        relationships: [],
        relatedCharacters: [],
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deleted: false,
        _syncStatus: 'pending',
        _lastModified: Date.now(),
      })

      // --- 角色 B ---
      const charBId = await db.characters.add({
        name: '示例角色B',
        aliases: ['紫电使者'],
        race: '精灵',
        element: '雷',
        occupation: '学者',
        nationalityLegacy: '暮光联邦',
        height: '168cm',
        birthday: '',
        avatarUrl: CHAR_B_AVATAR,
        qAvatarUrl: CHAR_B_QAVATAR,
        avatars: [
          { url: CHAR_B_PORTRAIT1, type: 'portrait' },
          { url: CHAR_B_PORTRAIT2, type: 'portrait' },
        ],
        gallery: CHAR_B_GALLERY,
        headerUrl: CHAR_B_HEADER,
        bio: SAMPLE_HTML,
        lifeStory: SAMPLE_HTML,
        relationships: [],
        relatedCharacters: [
          { characterId: charAId, name: '示例角色A', relation: '挚友' },
        ],
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deleted: false,
        _syncStatus: 'pending',
        _lastModified: Date.now(),
      })

      // --- 角色 C ---
      const charCId = await db.characters.add({
        name: '示例角色C',
        aliases: ['翠风行者'],
        race: '半精灵',
        element: '风',
        occupation: '游侠',
        nationalityLegacy: '暮光联邦',
        height: '180cm',
        birthday: '',
        avatarUrl: CHAR_C_AVATAR,
        qAvatarUrl: CHAR_C_QAVATAR,
        avatars: [
          { url: CHAR_C_PORTRAIT1, type: 'portrait' },
          { url: CHAR_C_PORTRAIT2, type: 'portrait' },
        ],
        gallery: CHAR_C_GALLERY,
        headerUrl: CHAR_C_HEADER,
        bio: SAMPLE_HTML,
        lifeStory: SAMPLE_HTML,
        relationships: [],
        relatedCharacters: [
          { characterId: charAId, name: '示例角色A', relation: '旧识' },
          { characterId: charBId, name: '示例角色B', relation: '师徒' },
        ],
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deleted: false,
        _syncStatus: 'pending',
        _lastModified: Date.now(),
      })

      // 回填 A 对 B、C 的关系
      await db.characters.update(charAId, {
        relatedCharacters: [
          { characterId: charBId, name: '示例角色B', relation: '挚友' },
          { characterId: charCId, name: '示例角色C', relation: '旧识' },
        ],
      })

      // --- 事件1：转折之路（长事件）---
      const event1Id = await db.events.add({
        title: '示例事件：转折之路',
        time: '2018',
        endTime: '2021',
        location: '落基山脉',
        summary: SAMPLE_TEXT_P1.slice(0, 100),
        content: SAMPLE_HTML,
        isMajor: true,
        characters: [charAId, charBId],
        countries: [],
        images: [
          { url: EVENT1_IMAGE1, caption: '' },
          { url: EVENT1_IMAGE2, caption: '' },
        ],
        parentEventId: null,
        relations: [],
        tags: [],
        headerUrl: EVENT1_HEADER,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deleted: false,
        _syncStatus: 'pending',
        _lastModified: Date.now(),
      })

      // --- 事件2：柳暗花明 ---
      await db.events.add({
        title: '示例事件：柳暗花明',
        time: '2022',
        location: '盘山公路',
        summary: SAMPLE_TEXT_P2.slice(0, 100),
        content: SAMPLE_HTML,
        isMajor: false,
        characters: [charBId, charCId],
        countries: [],
        images: [
          { url: EVENT2_IMAGE1, caption: '' },
          { url: EVENT2_IMAGE2, caption: '' },
        ],
        parentEventId: null,
        relations: [],
        tags: [],
        headerUrl: EVENT2_HEADER,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deleted: false,
        _syncStatus: 'pending',
        _lastModified: Date.now(),
      })

      // --- 国家1：晨曦共和国 ---
      const country1Id = await db.countries.add({
        name: '示例国家：晨曦共和国',
        parentId: null,
        description: '',
        system: SAMPLE_HTML,
        geography: SAMPLE_HTML,
        culture: SAMPLE_HTML,
        flagUrl: COUNTRY1_FLAG,
        headerUrl: COUNTRY1_HEADER,
        characters: [charAId],
        events: [],
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deleted: false,
        _syncStatus: 'pending',
        _lastModified: Date.now(),
      })

      // --- 国家2：暮光联邦 ---
      await db.countries.add({
        name: '示例国家：暮光联邦',
        parentId: null,
        description: '',
        system: SAMPLE_HTML,
        geography: SAMPLE_HTML,
        culture: SAMPLE_HTML,
        flagUrl: COUNTRY2_FLAG,
        headerUrl: COUNTRY2_HEADER,
        characters: [charBId, charCId],
        events: [],
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deleted: false,
        _syncStatus: 'pending',
        _lastModified: Date.now(),
      })

      // --- 时期：漫漫长路 ---
      await db.periods.add({
        name: '示例时期：漫漫长路',
        startTime: '2015',
        endTime: '2023',
        color: '#C68D44',
        _syncStatus: 'pending',
        _lastModified: Date.now(),
        deleted: false,
      })

      // --- 词条1：转弯 ---
      const entry1Id = await db.worldEntries.add({
        title: '示例词条：转弯',
        content: SAMPLE_HTML,
        category: '概念',
        parentId: null,
        order: 0,
        isConcept: true,
        references: [],
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deleted: false,
        _syncStatus: 'pending',
        _lastModified: Date.now(),
      })

      // --- 词条2：引用演示（含 [[]] 内链和 @引用）---
      const entry2Doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '关于' },
              { type: 'wikiLink', attrs: { id: String(entry1Id), label: '示例词条：转弯' } },
              { type: 'text', text: '中提到的人生智慧，在' },
              { type: 'mention', attrs: { id: String(charAId), label: '示例角色A', entityType: 'character' } },
              { type: 'text', text: '的旅途中得到了印证。' },
            ],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '详见事件' },
              { type: 'mention', attrs: { id: String(event1Id), label: '示例事件：转折之路', entityType: 'event' } },
              { type: 'text', text: '，以及' },
              { type: 'mention', attrs: { id: String(country1Id), label: '示例国家：晨曦共和国', entityType: 'country' } },
              { type: 'text', text: '的背景设定。' },
            ],
          },
        ],
      }
      await db.worldEntries.add({
        title: '示例词条：引用演示',
        content: JSON.stringify(entry2Doc),
        category: '概念',
        parentId: null,
        order: 1,
        isConcept: true,
        references: [
          { targetType: 'world', targetId: entry1Id },
          { targetType: 'character', targetId: charAId },
          { targetType: 'event', targetId: event1Id },
          { targetType: 'country', targetId: country1Id },
        ],
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deleted: false,
        _syncStatus: 'pending',
        _lastModified: Date.now(),
      })

      notifyDataUpdated()
    }

    seed().catch(console.error)
  }, [])

  return null
}
