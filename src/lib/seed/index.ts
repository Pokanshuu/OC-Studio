import { notifyDataUpdated } from '@/lib/data-events'
import * as data from './data'

const {
  CHAR_A_AVATAR,
  CHAR_A_GALLERY,
  CHAR_A_HEADER,
  CHAR_A_PORTRAIT1,
  CHAR_A_PORTRAIT2,
  CHAR_B_AVATAR,
  CHAR_B_GALLERY,
  CHAR_B_HEADER,
  CHAR_B_PORTRAIT1,
  CHAR_B_PORTRAIT2,
  CHAR_C_AVATAR,
  CHAR_C_GALLERY,
  CHAR_C_HEADER,
  CHAR_C_PORTRAIT1,
  CHAR_C_PORTRAIT2,
  COUNTRY1_FLAG,
  COUNTRY1_HEADER,
  COUNTRY2_FLAG,
  COUNTRY2_HEADER,
  EVENT1_HEADER,
  EVENT1_IMAGE1,
  EVENT1_IMAGE2,
  EVENT2_HEADER,
  EVENT2_IMAGE1,
  EVENT2_IMAGE2,
  SAMPLE_HTML,
  SAMPLE_TEXT_P1,
  SAMPLE_TEXT_P2,
} = data

/**
 * 向空库播种示例内容（角色 / 事件 / 国家 / 词条 / 时期）。
 *
 * 幂等：库内已有角色时直接返回。原先内联在 SeedData 组件的 effect 里。
 */
export async function seedSampleData(): Promise<void> {      const { db } = await import('@/lib/db')
      const count = await db.characters.count()
      if (count > 0) return

      // --- 角色 A ---
      const charAId = await db.characters.add({
        name: '示例角色A',
        aliases: ['烈焰使者'],
        race: '人类',
        element: '火',
        occupation: '冒险者',
        faction: '',
        nationalityLegacy: '晨曦共和国',
        height: '175cm',
        birthday: '',
        avatarUrl: CHAR_A_AVATAR,
        avatars: [
          { url: CHAR_A_PORTRAIT1, type: 'portrait' },
          { url: CHAR_A_PORTRAIT2, type: 'portrait' },
        ],
        gallery: CHAR_A_GALLERY,
        headerUrl: CHAR_A_HEADER,
        bio: SAMPLE_HTML,
        lifeStory: SAMPLE_HTML,
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
        faction: '',
        nationalityLegacy: '暮光联邦',
        height: '168cm',
        birthday: '',
        avatarUrl: CHAR_B_AVATAR,
        avatars: [
          { url: CHAR_B_PORTRAIT1, type: 'portrait' },
          { url: CHAR_B_PORTRAIT2, type: 'portrait' },
        ],
        gallery: CHAR_B_GALLERY,
        headerUrl: CHAR_B_HEADER,
        bio: SAMPLE_HTML,
        lifeStory: SAMPLE_HTML,
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
        faction: '',
        nationalityLegacy: '暮光联邦',
        height: '180cm',
        birthday: '',
        avatarUrl: CHAR_C_AVATAR,
        avatars: [
          { url: CHAR_C_PORTRAIT1, type: 'portrait' },
          { url: CHAR_C_PORTRAIT2, type: 'portrait' },
        ],
        gallery: CHAR_C_GALLERY,
        headerUrl: CHAR_C_HEADER,
        bio: SAMPLE_HTML,
        lifeStory: SAMPLE_HTML,
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
        category: '',
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
        category: '',
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

