/**
 * 相册分类自检（`npm run audit:album`）。
 *
 * 盯的是「抽屉名与槽位不再各写一份」：
 * - 同一个 gallery 槽位在四个宿主里必须都叫「画廊」，旗帜必须是「旗帜」；
 * - 每个抽屉的文案只能来自 `ALBUM_SLOT_LABELS`，不许在树里就地写；
 * - 相册不建的槽位（动画 / 小说封面 / 地图底图）必须显式登记，不能悄悄漏；
 * - 树的 key / (sourceType, category) 不能重复，否则计数会算重。
 *
 * 纯静态检查，不需要真实 vault。
 */
import type { AlbumEntry } from '../src/components/shared/useAlbumData'
import {
  ALBUM_EXCLUDED_CATEGORIES,
  ALBUM_SLOT_LABELS,
  CATEGORY_TREE,
  albumCategoryLabel,
  albumSourceType,
  getSubCount,
  getTopCount,
  matchesAlbumCategory,
} from '../src/components/shared/album-utils'

let passed = 0
const failures: string[] = []

function check(name: string, condition: boolean): void {
  if (condition) {
    passed += 1
    return
  }
  failures.push(name)
}

function entry(sourceType: string, category: string, id = 1): AlbumEntry {
  return {
    url: `附件/${sourceType}-${category}.png`,
    sourceName: `${sourceType}-${id}`,
    sourceType,
    sourceId: id,
    category,
    updatedAt: 0,
    tags: [],
  }
}

const subOf = (key: string) => {
  for (const top of CATEGORY_TREE) {
    const sub = top.children.find((child) => child.key === key)
    if (sub !== undefined) return sub
  }
  return null
}

const characterGallery = subOf('character:gallery')
const eventGallery = subOf('event:gallery')
const countryFlag = subOf('country:flag')
const worldEntryImage = subOf('worldEntry:image')

// ── 槽位名 ──────────────────────────────────────────────────────────────
check('gallery 槽位名 = 画廊', ALBUM_SLOT_LABELS.gallery === '画廊')
check('flag 槽位名 = 旗帜', ALBUM_SLOT_LABELS.flag === '旗帜')
check('image 槽位名 = 图片（单张）', ALBUM_SLOT_LABELS.image === '图片')
check('body 槽位名 = 正文图片', ALBUM_SLOT_LABELS.body === '正文图片')
check('未知 category 原样返回', albumCategoryLabel('unknown') === 'unknown')
check('角色 gallery 抽屉 = 画廊', characterGallery?.label === '画廊')
check('事件 gallery 抽屉 = 画廊', eventGallery?.label === '画廊')
check('国家 flag 抽屉 = 旗帜', countryFlag?.label === '旗帜')
check('词条 image 抽屉 = 图片', worldEntryImage?.label === '图片')
check('相册里不再出现「相册图片」', CATEGORY_TREE.every((top) => top.children.every((sub) => sub.label !== '相册图片')))

// ── 树的结构 ────────────────────────────────────────────────────────────
const topKeys = CATEGORY_TREE.map((top) => top.key)
const subKeys = CATEGORY_TREE.flatMap((top) => top.children.map((sub) => sub.key))
const slots = CATEGORY_TREE.flatMap((top) =>
  top.children.map((sub) => `${sub.sourceType}:${sub.category}`),
)

check('顶级分类不重名', new Set(topKeys).size === topKeys.length)
check('抽屉 key 不重名', new Set(subKeys).size === subKeys.length)
check('(sourceType, category) 不重复', new Set(slots).size === slots.length)
check('每个抽屉都有文案', CATEGORY_TREE.every((top) => top.children.every((sub) => sub.label.trim() !== '')))
check(
  '抽屉文案只来自 ALBUM_SLOT_LABELS',
  CATEGORY_TREE.every((top) => top.children.every((sub) => sub.label === ALBUM_SLOT_LABELS[sub.category])),
)
check(
  '相册用到的八个槽位都有抽屉',
  (Object.keys(ALBUM_SLOT_LABELS) as Array<keyof typeof ALBUM_SLOT_LABELS>).every((category) =>
    CATEGORY_TREE.some((top) => top.children.some((sub) => sub.category === category)),
  ),
)
check(
  '不进相册的槽位没有混进树',
  ALBUM_EXCLUDED_CATEGORIES.every((category) =>
    CATEGORY_TREE.every((top) => top.children.every((sub) => sub.category !== category)),
  ),
)

// ── 选中 / 计数 ─────────────────────────────────────────────────────────
check('子级 key 能反查实体类型', albumSourceType('character:gallery') === 'character')
check('顶级 key 就是实体类型', albumSourceType('character') === 'character')
check('未知 key 不误判', albumSourceType('all') === null)

check('角色 gallery 命中自己的抽屉', matchesAlbumCategory(entry('character', 'gallery'), 'character:gallery'))
check('角色 gallery 命中角色顶级', matchesAlbumCategory(entry('character', 'gallery'), 'character'))
check('角色 gallery 不命中事件抽屉', !matchesAlbumCategory(entry('character', 'gallery'), 'event:gallery'))
check('all 命中一切', matchesAlbumCategory(entry('character', 'gallery'), 'all'))

const galleryOnly = [entry('character', 'gallery'), entry('event', 'gallery')]
if (characterGallery !== null) {
  check('同一槽位跨宿主按 sourceType 分开计数', getSubCount(galleryOnly, characterGallery) === 1)
}
check(
  '顶级计数只算自己的子槽位',
  getTopCount([entry('character', 'gallery'), entry('character', 'body'), entry('event', 'gallery')], CATEGORY_TREE[0]) === 2,
)

if (failures.length > 0) {
  console.error(`相册分类自检失败 ${failures.length}/${passed + failures.length}：`)
  for (const name of failures) console.error(`  ✗ ${name}`)
  process.exit(1)
}

console.log(`相册分类自检通过：${passed} 项断言`)
