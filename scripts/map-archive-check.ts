/**
 * `.ocmap` 地图档案自检：`npx tsx scripts/map-archive-check.ts`
 *
 * 只验纯函数（序列化 / 解析 / 图片编解码 / 像素→归一化换算），不碰磁盘与 Dexie。
 * 目标：**导出的档案自己能读回来，别人的旧档案也能读进来**，且坏档案不静默吞掉。
 */
import {
  OCMAP_FORMAT,
  archiveFileName,
  archiveImageToBlob,
  blobToArchiveImage,
  dataUrlToImage,
  imageToDataUrl,
  parseMapArchive,
  scaleAnnotations,
  serializeMapArchive,
  type MapArchive,
} from '../src/features/map/archive'
import { stringifyAnnotations } from '../src/features/map/annotations'

let passed = 0
function check(name: string, ok: boolean) {
  if (ok) {
    passed += 1
    console.log(`  OK ${name}`)
  } else {
    console.error(`  FAIL ${name}`)
    process.exitCode = 1
  }
}
async function main(): Promise<void> {

  const border = {
    id: 'b1',
    kind: 'border' as const,
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.4, y: 0.1 },
      { x: 0.25, y: 0.4 },
    ],
    color: '靛蓝',
    fill: '苔绿',
  }
  const road = {
    id: 'r1',
    kind: 'road' as const,
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.3, y: 0.4 },
    ],
  }

  const archive: MapArchive = {
    name: '雾海',
    seed: 77001,
    params: { preset: 'continent' },
    view: 'biome',
    width: 960,
    height: 640,
    annotations: [border, road],
  }

  /* ── 往返 ─────────────────────────────────────────────────────────────── */

  const text = serializeMapArchive(archive, new Date('2026-11-06T00:00:00Z'))
  const parsed = parseMapArchive(text)
  check('格式标识写对', JSON.parse(text).format === OCMAP_FORMAT)
  check('名字往返', parsed.archive.name === '雾海')
  check('种子往返', parsed.archive.seed === 77001)
  check('档位往返', parsed.archive.view === 'biome')
  check('尺寸往返', parsed.archive.width === 960 && parsed.archive.height === 640)
  check('标注条数往返', parsed.archive.annotations.length === 2)
  check('国界填充色往返', parsed.archive.annotations[0]?.fill === '苔绿')
  check('国界线条色往返', parsed.archive.annotations[0]?.color === '靛蓝')
  check('道路不写填充色', parsed.archive.annotations[1]?.fill === undefined)
  check('归一化坐标不被当成像素', parsed.coordinateSpace === 'normalized')
  check('导出没有告警', parsed.warnings.length === 0)

  /* ── 图片 ─────────────────────────────────────────────────────────────── */

  const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3])
  const image = await blobToArchiveImage(new Blob([bytes], { type: 'image/png' }))
  const dataUrl = imageToDataUrl(image)
  check('图片 MIME 保留', image.mime === 'image/png')
  check('data URL 前缀正确', dataUrl.startsWith('data:image/png;base64,'))
  check('data URL 能解回同一份字节', (() => {
    const back = dataUrlToImage(dataUrl)
    if (back === null) return false
    const decoded = new Uint8Array(archiveImageToBlob(back).size ? [] : [])
    void decoded
    return back.mime === 'image/png' && back.base64 === image.base64
  })())
  check('缺 ;base64 的 data URL 被拒', dataUrlToImage('data:image/png,abc') === null)
  check('非图片 data URL 被拒', dataUrlToImage('data:text/plain;base64,YWJj') === null)
  check('非字符串被拒', dataUrlToImage(42) === null)
  const withImage = parseMapArchive(serializeMapArchive({ ...archive, image }))
  check('图片能往返进档案', withImage.archive.image?.base64 === image.base64)

  /* ── 改版（像素坐标）档案 ─────────────────────────────────────────────── */

  const legacy = JSON.stringify({
    format: OCMAP_FORMAT,
    version: 1,
    map: {
      name: '旧图',
      seed: 5,
      params: { preset: 'continent' },
      annotations: [
        { type: 'polygon', points: [{ x: 100, y: 100 }, { x: 400, y: 100 }, { x: 250, y: 400 }], color: '#336699' },
        { type: 'road', points: [{ x: 10, y: 20 }, { x: 300, y: 400 }] },
        { type: 'city', name: '旧港', points: [{ x: 50, y: 60 }] },
      ],
    },
  })
  const legacyParsed = parseMapArchive(legacy)
  check('改版 polygon 读成国界', legacyParsed.archive.annotations[0]?.kind === 'border')
  check('改版道路读成道路', legacyParsed.archive.annotations[1]?.kind === 'road')
  check('城市标注被跳过并告警', legacyParsed.warnings.some((line) => line.includes('城市')))
  check('像素坐标被识别', legacyParsed.coordinateSpace === 'pixel')
  check('非法色值不留下', legacyParsed.archive.annotations[0]?.color === undefined)

  const scaled = scaleAnnotations(legacyParsed.archive.annotations, 1000, 500)
  check('像素 → 归一化', Math.abs((scaled[0]?.points[2]?.x ?? 0) - 0.25) < 1e-9)
  check('归一化后不越界', scaled.every((item) => item.points.every((point) => point.x <= 1 && point.y <= 1)))
  check('尺寸未知时原样返回', scaleAnnotations(legacyParsed.archive.annotations, 0, 0)[0]?.points[0]?.x === 100)

  /* ── 坏档案 ───────────────────────────────────────────────────────────── */

  function throws(fn: () => unknown): boolean {
    try {
      fn()
      return false
    } catch {
      return true
    }
  }
  check('非 JSON 抛错', throws(() => parseMapArchive('not json')))
  check('缺少格式标识抛错', throws(() => parseMapArchive('{"map":{}}')))
  check('缺少地图抛错', throws(() => parseMapArchive(JSON.stringify({ format: OCMAP_FORMAT }))))
  check('更高版本只告警不拒收', parseMapArchive(JSON.stringify({ format: OCMAP_FORMAT, version: 99, map: { name: 'x' } })).warnings.length === 1)
  check('缺名字给默认名', parseMapArchive(JSON.stringify({ format: OCMAP_FORMAT, map: {} })).archive.name === '导入地图')
  check('坏标注不连坐整份档案', parseMapArchive(JSON.stringify({
    format: OCMAP_FORMAT,
    map: { name: 'x', annotations: [{ kind: 'border', points: [{ x: 0.1, y: 0.1 }] }, road] },
  })).archive.annotations.length === 1)

  /* ── 文件名 ───────────────────────────────────────────────────────────── */

  check('文件名去掉 Windows 非法字符', archiveFileName('a/b:c*?"<>|d') === 'a-b-c-d.ocmap')
  check('空名字有兜底', archiveFileName('   ') === '地图.ocmap')
  check('扩展名固定 .ocmap', archiveFileName('雾海').endsWith('.ocmap'))

  /* ── 与标注序列化口径一致 ─────────────────────────────────────────────── */

  const normalized = JSON.parse(stringifyAnnotations([border]) ?? '[]')
  check(
    '档案里的标注与 map_annotations 同形',
    JSON.stringify(parseMapArchive(serializeMapArchive({ ...archive, annotations: [border] })).archive.annotations) ===
      JSON.stringify(normalized),
  )

  console.log(`\n地图档案自检：${passed} 项断言通过`)
}

void main()

