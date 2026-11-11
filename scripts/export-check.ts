/**
 * 导出中心 · 海报契约自检：`npx tsx scripts/export-check.ts`
 *
 * 不打开浏览器，只校验「纯数据」这一层：
 * 六套版式齐全 / 元数据合法 / 选项兜底与夹取 / 正文块顺序 / 画布尺寸。
 * 真正的渲染由 `npm run audit:design` 与手工截图兜底。
 */
import {
  DEFAULT_POSTER_BLOCK_ORDER,
  DEFAULT_POSTER_OPTIONS,
  POSTER_BASE_FONT_SIZE,
  POSTER_COVER_POSITION_CENTER,
  POSTER_COVER_ZOOM_MAX,
  POSTER_PADDING,
  POSTER_PADDING_IDS,
  POSTER_RATIO_IDS,
  POSTER_RATIOS,
  POSTER_TEMPLATE_IDS,
  POSTER_BLOCK_IDS,
  enabledPosterBlocks,
  hasCustomCoverFraming,
  normalizeBlockOrder,
  type PosterOptions,
} from '../src/lib/export/poster/types'
import { POSTER_TEMPLATE_INFO } from '../src/lib/export/poster/catalog'
import { moveBlock, normalizePosterOptions, optionsForTemplate, posterTemplateDefaults } from '../src/lib/export/poster/options'
import type { TemplateDoc } from '../src/lib/templates/types'
import { clampCoverPosition, clampCoverZoom, coverOverflow, panCover, zoomCover } from '../src/lib/export/poster/cover-frame'
import { localDateStamp, localDateTimeStamp } from '../src/lib/date-stamp'
import { remapRowRefs } from '../src/lib/import-remap'

let passed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1
    return
  }
  failures.push(detail ? `${name}：${detail}` : name)
}

// ── 1. 六套版式 ─────────────────────────────────────────────
const infos = Object.values(POSTER_TEMPLATE_INFO)
check('版式数量 = 6', infos.length === 6, String(infos.length))
check(
  '版式 id 与登记表一致',
  POSTER_TEMPLATE_IDS.every((id) => POSTER_TEMPLATE_INFO[id]?.id === id),
)
check('版式名不重复', new Set(infos.map((info) => info.name)).size === infos.length)
for (const info of infos) {
  check(`版式 ${info.id}：有名字`, info.name.trim() !== '')
  check(`版式 ${info.id}：有观感`, info.hint.trim() !== '' && info.hint.length <= 10, info.hint)
  check(`版式 ${info.id}：auto 在支持集里`, info.coverPlacements.includes('auto'))
  check(`版式 ${info.id}：支持集无重复`, new Set(info.coverPlacements).size === info.coverPlacements.length)
  check(`版式 ${info.id}：默认对齐合法`, ['left', 'center', 'right'].includes(info.defaultAlign))
  check(`版式 ${info.id}：默认列数合法`, info.defaultFieldColumns === 1 || info.defaultFieldColumns === 2)
}
check('夜色固定墨底', POSTER_TEMPLATE_INFO.noir.tone === 'ink')
check('刊首支持左右侧栏', ['left', 'right'].every((value) => POSTER_TEMPLATE_INFO.editorial.coverPlacements.includes(value as never)))

// ── 2. 画布 ────────────────────────────────────────────────
check('比例四档', POSTER_RATIO_IDS.length === 4)
for (const ratio of POSTER_RATIO_IDS) {
  const meta = POSTER_RATIOS[ratio]
  check(`比例 ${ratio}：宽 1080`, meta.width === 1080)
  check(`比例 ${ratio}：有高度`, meta.height > 0)
  check(`比例 ${ratio}：有标签`, meta.label.trim() !== '')
}
check('留白三档', POSTER_PADDING_IDS.length === 3)
check('留白递增', POSTER_PADDING.compact < POSTER_PADDING.standard && POSTER_PADDING.standard < POSTER_PADDING.loose)
check('基准字号 24', POSTER_BASE_FONT_SIZE === 24, String(POSTER_BASE_FONT_SIZE))

// ── 3. 选项兜底 ────────────────────────────────────────────
const fallback = normalizePosterOptions(null)
check('空值 → 默认版式', fallback.template === DEFAULT_POSTER_OPTIONS.template)
check('空值 → 默认顺序', fallback.blockOrder.join() === DEFAULT_POSTER_BLOCK_ORDER.join())

const garbage = normalizePosterOptions({
  template: '不存在',
  ratio: 'huge',
  background: 'rainbow',
  padding: 'wide',
  fontScale: 99,
  titleScale: -3,
  coverPlacement: '居中',
  coverScale: 0,
  coverZoom: 99,
  coverX: -40,
  coverY: 260,
  align: 'justify',
  fieldColumns: 7,
  blockOrder: ['body', 'body', 'nope', 'summary'],
})
check('非法版式回落', garbage.template === 'editorial')
check('非法比例回落', garbage.ratio === 'card')
check('非法背景回落', garbage.background === 'paper')
check('非法留白回落', garbage.padding === 'standard')
check('字号上限夹取', garbage.fontScale === 1.5, String(garbage.fontScale))
check('标题上限夹取', garbage.titleScale === 0.8, String(garbage.titleScale))
check('非法封面位置回落', garbage.coverPlacement === 'auto')
check('封面倍率下限夹取', garbage.coverScale === 0.7, String(garbage.coverScale))
check('封面缩放上限夹取', garbage.coverZoom === POSTER_COVER_ZOOM_MAX, String(garbage.coverZoom))
check('取景 X 下限夹取', garbage.coverX === 0, String(garbage.coverX))
check('取景 Y 上限夹取', garbage.coverY === 100, String(garbage.coverY))
check('非法对齐回落', garbage.align === 'auto')
check('非法列数回落', garbage.fieldColumns === 'auto')
check('正文顺序补全且去重', garbage.blockOrder.length === POSTER_BLOCK_IDS.length)
check('用户顺序优先', garbage.blockOrder[0] === 'body' && garbage.blockOrder[1] === 'summary')

// ── 3.5 封面取景（遮罩不动，图在里面缩放 / 平移）────────────────
check('默认取景不缩放', fallback.coverZoom === 1, String(fallback.coverZoom))
check(
  '默认取景居中',
  fallback.coverX === POSTER_COVER_POSITION_CENTER && fallback.coverY === POSTER_COVER_POSITION_CENTER,
)
check('默认取景视为未改动', hasCustomCoverFraming(fallback) === false)
check(
  '放大后视为已改动',
  hasCustomCoverFraming({ ...fallback, coverZoom: 1.4 }) === true,
)
check(
  '平移后视为已改动',
  hasCustomCoverFraming({ ...fallback, coverX: 20 }) === true,
)
check(
  '旧预设没有取景字段 → 居中不缩放',
  (() => {
    const legacy = normalizePosterOptions({ template: 'noir', ratio: 'portrait' })
    return legacy.coverZoom === 1 && legacy.coverX === 50 && legacy.coverY === 50
  })(),
)

// ── 3.6 取景几何（遮罩不动，图片平移 / 缩放）──────────────
const splitBox = { width: 432, height: 1440, naturalWidth: 600, naturalHeight: 900 }
const baseFrame = { zoom: 1, x: 50, y: 50 }
const baseOverflow = coverOverflow(baseFrame, splitBox)
check('铺满时纵向余量为 0', baseOverflow.y === 0, String(baseOverflow.y))
check('铺满时横向有余量（图更宽）', baseOverflow.x > 0, String(baseOverflow.x))

const zoomedOverflow = coverOverflow({ ...baseFrame, zoom: 2 }, splitBox)
// 接近正方的遮罩：图在两个方向上都还有余量
const squareBox = { width: 900, height: 900, naturalWidth: 600, naturalHeight: 900 }
check(
  '放大后纵向也有余量',
  coverOverflow({ ...baseFrame, zoom: 2 }, squareBox).y > 0,
  String(coverOverflow({ ...baseFrame, zoom: 2 }, squareBox).y),
)
check('放大后横向余量变大', zoomedOverflow.x > baseOverflow.x)

const dragRight = panCover(baseFrame, splitBox, 100, 0)
check('向右拖 → 看更靠左的图（x 变小）', dragRight.x < baseFrame.x, String(dragRight.x))
const dragLeft = panCover(baseFrame, splitBox, -100, 0)
check('向左拖 → 看更靠右的图（x 变大）', dragLeft.x > baseFrame.x, String(dragLeft.x))
check('纵向没余量 → y 不动', dragRight.y === baseFrame.y, String(dragRight.y))
check('拖过头夹在 0', panCover(baseFrame, splitBox, 99999, 0).x === 0)
check('拖过头夹在 100', panCover(baseFrame, splitBox, -99999, 0).x === 100)

const wheelUp = zoomCover(baseFrame, -240)
const wheelDown = zoomCover({ ...baseFrame, zoom: 2 }, 240)
check('滚轮上滚放大', wheelUp > baseFrame.zoom, String(wheelUp))
check('滚轮下滚缩小', wheelDown < 2, String(wheelDown))
check('缩放上限 3', zoomCover({ ...baseFrame, zoom: 2.9 }, -1000) === POSTER_COVER_ZOOM_MAX)
check('缩放下限 1', zoomCover({ ...baseFrame, zoom: 1.1 }, 1000) === 1)
check('图未解码时按倍率兜底余量', coverOverflow({ zoom: 2, x: 50, y: 50 }, { ...splitBox, naturalWidth: 0, naturalHeight: 0 }).y > 0)
check('非法缩放夹到 1', clampCoverZoom(Number.NaN) === 1)
check('非法取景夹到 50', clampCoverPosition(Number.NaN) === 50)

const order = normalizeBlockOrder(['gallery', 'fields', 'gallery', 'body'])
check('normalizeBlockOrder 去重', order.filter((id) => id === 'gallery').length === 1)
check('normalizeBlockOrder 补全', order.length === POSTER_BLOCK_IDS.length)
check('normalizeBlockOrder 保序', order[0] === 'gallery' && order[1] === 'fields')

const moved = moveBlock(DEFAULT_POSTER_BLOCK_ORDER, 'fields', 1)
check('下移一位', moved[0] === 'tags' && moved[1] === 'fields')
check('首位上移不越界', moveBlock(DEFAULT_POSTER_BLOCK_ORDER, 'fields', -1)[0] === 'fields')
check(
  '末位下移不越界',
  moveBlock(DEFAULT_POSTER_BLOCK_ORDER, 'gallery', 1)[POSTER_BLOCK_IDS.length - 1] === 'gallery',
)

// ── 4. 正文块开关与顺序 ────────────────────────────────────
const options: PosterOptions = {
  ...DEFAULT_POSTER_OPTIONS,
  showFields: false,
  showBody: false,
  blockOrder: ['summary', 'tags', 'fields', 'body', 'time', 'location', 'relations', 'gallery'],
}
const enabled = enabledPosterBlocks(options)
check('关掉的块不出现', !enabled.includes('fields') && !enabled.includes('body'))
check('开着的块按用户顺序', enabled[0] === 'summary' && enabled[1] === 'tags')

// ── 5. 版式切换的合理起点 ──────────────────────────────────
const toNoir = optionsForTemplate({ ...DEFAULT_POSTER_OPTIONS, background: 'paper' }, 'noir')
check('切到夜色 → 墨底', toNoir.background === 'ink')
const backToPaper = optionsForTemplate(toNoir, 'editorial')
check('从夜色切回 → 纸底', backToPaper.background === 'paper')
check('同版式不动', optionsForTemplate(toNoir, 'noir') === toNoir)

// ── 海报默认选项跟编辑器模板对齐（只在没存过选项时用）───────────────
{
  const characterTemplate: TemplateDoc = {
    id: 'character',
    name: '角色',
    aliases: [],
    components: [
      { id: 'cover', enabled: false },
      { id: 'avatar', enabled: true },
      { id: 'info', enabled: false },
      { id: 'tags', enabled: true },
      { id: 'gallery', enabled: true },
      { id: 'relations', enabled: true },
      { id: 'body', enabled: true },
    ],
  }
  const defaults = posterTemplateDefaults('character', [characterTemplate])
  check('海报默认：模板关掉的基本信息不打印', defaults.showFields === false)
  check('海报默认：标签 / 关系 / 正文跟随模板', defaults.showTags === true && defaults.showRelations === true && defaults.showBody === true)
  check('海报默认：封面被关但头像在，仍算有封面', defaults.showCover === true)
  check(
    '海报默认：正文块顺序跟随模板',
    (defaults.blockOrder ?? []).join(',') === 'tags,gallery,relations,body',
    (defaults.blockOrder ?? []).join(','),
  )
  check('没有模板时不给默认覆盖', Object.keys(posterTemplateDefaults('event', undefined)).length === 0)
}

// ── 导出文件名的日期戳：本地时区，不是 UTC ──────────────────────────────
// 事故形状：UTC+8 的凌晨（本地 00:00–08:00）用 toISOString() 取日期，会写成「昨天」，
// 于是同一份备份在导出中心叫 11-12、在设置页叫 11-11。
{
  const earlyMorning = new Date(2026, 10, 12, 0, 30) // 本地 2026-11-12 00:30
  check('导出日期戳用本地日期', localDateStamp(earlyMorning) === '2026-11-12', localDateStamp(earlyMorning))
  check('日期戳补零', localDateStamp(new Date(2026, 0, 5, 9, 0)) === '2026-01-05')
  check(
    '精确到秒的戳同样是本地时间',
    localDateTimeStamp(new Date(2026, 10, 12, 0, 30, 7)) === '20261112-003007',
    localDateTimeStamp(new Date(2026, 10, 12, 0, 30, 7)),
  )
}

// ── 导入的引用重映射（备份 id → 落库 id / 悬空即清空）───────────────────
{
  const maps = {
    characters: new Map([[1, 11]]),
    countries: new Map([[5, 55]]),
    events: new Map([[2, 22]]),
    worldEntries: new Map([[3, 33]]),
    tags: new Map([[9, 99]]),
  }

  const characterPatch = remapRowRefs(
    'character',
    {
      countryId: 5,
      tags: [9, 8],
      relatedCharacters: [{ characterId: 1, name: '甲', relation: '师徒' }, { characterId: 7, name: '孤儿', relation: '' }],
      relatedNotes: [{ targetId: 3, name: '笔记', relation: '主角' }, { targetId: 4, name: '悬空', relation: '' }],
    },
    maps,
  )
  check('重映射 · 国籍跟着换成本库 id', characterPatch?.countryId === 55, JSON.stringify(characterPatch?.countryId))
  check('重映射 · 标签只留能解析的', JSON.stringify(characterPatch?.tags) === '[99]', JSON.stringify(characterPatch?.tags))
  check(
    '重映射 · 角色关系换 id、悬空的摘掉',
    JSON.stringify(characterPatch?.relatedCharacters) === JSON.stringify([{ characterId: 11, name: '甲', relation: '师徒' }]),
    JSON.stringify(characterPatch?.relatedCharacters),
  )
  check(
    '重映射 · 相关笔记同理',
    JSON.stringify(characterPatch?.relatedNotes) === JSON.stringify([{ targetId: 33, name: '笔记', relation: '主角' }]),
    JSON.stringify(characterPatch?.relatedNotes),
  )

  const eventPatch = remapRowRefs(
    'event',
    { countries: [5], characters: [1, 6], relations: [{ targetId: 2, relation: '前因' }, { targetId: 8, relation: '' }] },
    maps,
  )
  check('重映射 · 相关国家 / 参与者', JSON.stringify(eventPatch?.countries) === '[55]' && JSON.stringify(eventPatch?.characters) === '[11]')
  check(
    '重映射 · 事件关系（悬空摘掉）',
    JSON.stringify(eventPatch?.relations) === JSON.stringify([{ targetId: 22, relation: '前因' }]),
    JSON.stringify(eventPatch?.relations),
  )

  const notePatch = remapRowRefs('worldEntry', { relations: [{ targetId: 3, name: 'B', relation: '相关' }] }, maps)
  check('重映射 · 笔记关系', JSON.stringify(notePatch?.relations) === JSON.stringify([{ targetId: 33, name: 'B', relation: '相关' }]))

  check(
    '重映射 · 没有引用变化时返回 null',
    remapRowRefs('character', { countryId: null, tags: [], relatedCharacters: [], relatedNotes: [] }, maps) === null,
  )
}

if (failures.length > 0) {
  console.error('导出契约自检失败：')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(
  `导出契约自检通过：${passed} 项断言（六套版式 / 元数据 / 画布 / 选项兜底 / 正文顺序 / 封面取景 / 版式切换）`,
)
