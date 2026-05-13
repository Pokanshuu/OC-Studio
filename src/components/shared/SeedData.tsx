'use client'

import { useEffect } from 'react'

function svgUrl(svg: string): string {
  const url = 'data:image/svg+xml,' + encodeURIComponent(svg.trim())
  return url
}

// Minimal test — a red square, guaranteed valid
const TEST_RED = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="red"/></svg>`)

const SAMPLE_AVATAR_1 = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="100" fill="#4A90D9"/><circle cx="100" cy="72" r="32" fill="white" opacity="0.9"/><ellipse cx="100" cy="148" rx="52" ry="40" fill="white" opacity="0.9"/></svg>`)

const SAMPLE_AVATAR_2 = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="100" fill="#5CB85C"/><circle cx="100" cy="72" r="32" fill="white" opacity="0.9"/><ellipse cx="100" cy="148" rx="52" ry="40" fill="white" opacity="0.9"/></svg>`)

const SAMPLE_FIGURE_1 = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="200"><rect width="100" height="200" rx="4" fill="#F3EFE9"/><circle cx="50" cy="40" r="18" fill="#A5A098"/><path d="M30 65L70 65L75 120L25 120Z" fill="#A5A098"/><line x1="30" y1="120" x2="20" y2="180" stroke="#A5A098" stroke-width="4" stroke-linecap="round"/><line x1="70" y1="120" x2="80" y2="180" stroke="#A5A098" stroke-width="4" stroke-linecap="round"/></svg>`)

const SAMPLE_FIGURE_2 = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="200"><rect width="100" height="200" rx="4" fill="#F3EFE9"/><circle cx="50" cy="40" r="18" fill="#C68D44"/><path d="M30 65L70 65L75 120L25 120Z" fill="#C68D44"/><line x1="30" y1="120" x2="20" y2="180" stroke="#C68D44" stroke-width="4" stroke-linecap="round"/><line x1="70" y1="120" x2="80" y2="180" stroke="#C68D44" stroke-width="4" stroke-linecap="round"/></svg>`)

const SAMPLE_HEADER_1 = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><defs><linearGradient id="a" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#4A90D9"/><stop offset="100%" stop-color="#9B59B6"/></linearGradient></defs><rect width="600" height="200" fill="url(#a)"/><text x="300" y="110" text-anchor="middle" fill="white" opacity="0.5" font-size="24" font-family="sans-serif">阿斯加德</text></svg>`)

const SAMPLE_HEADER_2 = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><defs><linearGradient id="b" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#E67E22"/><stop offset="50%" stop-color="#F39C12"/><stop offset="100%" stop-color="#D35400"/></linearGradient></defs><rect width="600" height="200" fill="url(#b)"/><text x="300" y="110" text-anchor="middle" fill="white" opacity="0.5" font-size="24" font-family="sans-serif">约顿海姆</text></svg>`)

const SAMPLE_EMBLEM_1 = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect x="10" y="20" width="80" height="60" rx="6" fill="#F3EFE9"/><rect x="20" y="30" width="60" height="40" rx="3" fill="none" stroke="#4A90D9" stroke-width="2"/><path d="M40 40L50 33L60 40L57 55L43 55Z" fill="#4A90D9"/><rect x="35" y="55" width="30" height="6" rx="2" fill="#4A90D9"/></svg>`)

const SAMPLE_GALLERY_1 = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="c" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#3498DB"/><stop offset="100%" stop-color="#2ECC71"/></linearGradient></defs><rect width="400" height="300" fill="url(#c)"/><text x="200" y="160" text-anchor="middle" fill="white" opacity="0.6" font-size="28" font-family="sans-serif">彩虹桥</text></svg>`)

const SAMPLE_GALLERY_2 = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="d" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#9B59B6"/><stop offset="100%" stop-color="#E74C3C"/></linearGradient></defs><rect width="400" height="300" fill="url(#d)"/><text x="200" y="160" text-anchor="middle" fill="white" opacity="0.6" font-size="28" font-family="sans-serif">金宫</text></svg>`)

const SAMPLE_GALLERY_3 = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="e" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#1ABC9C"/><stop offset="100%" stop-color="#2980B9"/></linearGradient></defs><rect width="400" height="300" fill="url(#e)"/><text x="200" y="160" text-anchor="middle" fill="white" opacity="0.6" font-size="28" font-family="sans-serif">世界树</text></svg>`)

const SAMPLE_GALLERY_4 = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="f" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#F39C12"/><stop offset="100%" stop-color="#E74C3C"/></linearGradient></defs><rect width="400" height="300" fill="url(#f)"/><text x="200" y="160" text-anchor="middle" fill="white" opacity="0.6" font-size="28" font-family="sans-serif">英灵殿</text></svg>`)

export function SeedData() {
  useEffect(() => {
    if (typeof window === 'undefined' || window.__TAURI_INTERNALS__) return

    const seed = async () => {
      const { db } = await import('@/lib/db')
      const count = await db.characters.count()
      if (count > 0) { console.log('[SeedData] 已有数据，跳过'); return }
      console.log('[SeedData] 开始注入种子数据...')

      const char1Id = await db.characters.add({
        name: '索尔',
        aliases: ['雷神'],
        race: '阿萨神族',
        element: '雷',
        occupation: '战士',
        nationalityLegacy: '阿斯加德',
        height: '198cm',
        birthday: '',
        avatarUrl: SAMPLE_AVATAR_1,
        qAvatarUrl: SAMPLE_AVATAR_1,
        avatars: [{ url: SAMPLE_FIGURE_1, type: 'portrait' }, { url: SAMPLE_FIGURE_2, type: 'portrait' }],
        gallery: [
          { url: SAMPLE_HEADER_1, caption: '阿斯加德全景' },
          { url: SAMPLE_GALLERY_1, caption: '彩虹桥' },
          { url: SAMPLE_GALLERY_2, caption: '金宫' },
          { url: SAMPLE_GALLERY_3, caption: '世界树' },
          { url: SAMPLE_GALLERY_4, caption: '英灵殿' },
          { url: SAMPLE_FIGURE_1, caption: '战斗姿态' },
          { url: SAMPLE_FIGURE_2, caption: '雷神之锤' },
          { url: SAMPLE_AVATAR_1, caption: '头像' },
        ],
        headerUrl: SAMPLE_HEADER_1,
        bio: '<p>阿斯加德的雷神，奥丁之子。</p>',
        lifeStory: '<p>曾因傲慢被放逐到地球，学会谦逊后重获神力。</p>',
        relationships: [],
        relatedCharacters: [],
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deleted: false,
        _syncStatus: 'pending',
        _lastModified: Date.now(),
      })

      await db.characters.add({
        name: '洛基',
        aliases: ['诡计之神'],
        race: '约顿海姆巨人',
        element: '冰',
        occupation: '欺诈师',
        nationalityLegacy: '约顿海姆',
        height: '188cm',
        birthday: '',
        avatarUrl: TEST_RED,
        qAvatarUrl: TEST_RED,
        avatars: [{ url: SAMPLE_FIGURE_2, type: 'portrait' }],
        gallery: [
          { url: SAMPLE_HEADER_2, caption: '约顿海姆冰原' },
          { url: SAMPLE_FIGURE_2, caption: '诡计之貌' },
          { url: SAMPLE_GALLERY_1, caption: '冰霜城堡' },
          { url: SAMPLE_AVATAR_2, caption: '头像' },
        ],
        headerUrl: SAMPLE_HEADER_2,
        bio: '<p>诡计之神，索尔的兄弟。</p>',
        lifeStory: '<p>渴望王位，在善与恶之间反复横跳。</p>',
        relationships: [],
        relatedCharacters: [{ characterId: char1Id, name: '索尔', relation: '兄弟' }],
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deleted: false,
        _syncStatus: 'pending',
        _lastModified: Date.now(),
      })

      await db.countries.add({
        name: '阿斯加德',
        parentId: null,
        description: '',
        system: '<p>君主制，由奥丁统治。</p>',
        geography: '<p>漂浮于宇宙中的金色国度。</p>',
        culture: '<p>崇尚力量与荣耀。</p>',
        flagUrl: SAMPLE_EMBLEM_1,
        headerUrl: SAMPLE_HEADER_1,
        characters: [char1Id],
        events: [],
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deleted: false,
        _syncStatus: 'pending',
        _lastModified: Date.now(),
      })

      await db.events.add({
        title: '雷神之锤降临',
        time: '2011年',
        location: '新墨西哥州',
        summary: '索尔被放逐至地球',
        content: '<p>索尔被奥丁剥夺神力，放逐到地球。雷神之锤随之降临。</p>',
        isMajor: true,
        characters: [char1Id],
        countries: [],
        images: [],
        parentEventId: null,
        relations: [],
        tags: [],
        headerUrl: SAMPLE_HEADER_1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deleted: 0,
        _syncStatus: 'pending',
        _lastModified: Date.now(),
      })

      console.log('[SeedData] 种子数据注入完成, 测试URL:', TEST_RED.substring(0, 100) + '...')
      window.dispatchEvent(new CustomEvent('data-updated'))
    }

    seed().catch(console.error)
  }, [])

  return null
}
