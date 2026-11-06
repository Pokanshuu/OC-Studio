/**
 * 关系图导出**版式**自检：`npx tsx scripts/graph-export-check.ts`
 *
 * 只验参数层（`features/relations/export-options.ts`）——真正画图要 canvas，
 * 那是浏览器里的事。这里盯三件容易漂的事：预设有没漏进界面的档位、
 * 越界值有没有被夹住、微调之后还会不会假装还是预设。
 */
import {
  DEFAULT_GRAPH_STYLE,
  GRAPH_PADDING_OPTIONS,
  GRAPH_SCALE_OPTIONS,
  GRAPH_STYLE_PRESETS,
  GRAPH_WIDTH_OPTIONS,
  graphPresetIdOf,
  normalizeGraphStyle,
} from '../src/features/relations/export-options'

let passed = 0
function check(name: string, ok: boolean) {
  if (ok) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    console.error(`  ✗ ${name}`)
    process.exitCode = 1
  }
}

const widthValues = GRAPH_WIDTH_OPTIONS.map((option) => option.value)
const paddingValues = GRAPH_PADDING_OPTIONS.map((option) => option.value)
const scaleValues = GRAPH_SCALE_OPTIONS.map((option) => option.value)

check('三套预设', GRAPH_STYLE_PRESETS.length === 3)
check('预设名唯一', new Set(GRAPH_STYLE_PRESETS.map((preset) => preset.id)).size === GRAPH_STYLE_PRESETS.length)
check(
  '三套预设参数互不相同',
  new Set(GRAPH_STYLE_PRESETS.map((preset) => JSON.stringify(preset.style))).size === GRAPH_STYLE_PRESETS.length,
)
check('默认参数对应「留白」', graphPresetIdOf(DEFAULT_GRAPH_STYLE) === 'poster')
check('改一个参数就不再命中预设', graphPresetIdOf({ ...DEFAULT_GRAPH_STYLE, edgeWidth: 2.2 }) === null)
check(
  '每套预设的线宽都是界面给的档位',
  GRAPH_STYLE_PRESETS.every((preset) => widthValues.includes(preset.style.edgeWidth)),
)
check(
  '每套预设的留白都是界面给的档位',
  GRAPH_STYLE_PRESETS.every((preset) => paddingValues.includes(preset.style.padding)),
)
check(
  '每套预设的倍率都是界面给的档位',
  GRAPH_STYLE_PRESETS.every((preset) => scaleValues.includes(preset.style.scale)),
)

const ink = GRAPH_STYLE_PRESETS.find((preset) => preset.id === 'ink')
check('墨线 = 名字节点 + 单色 + 不写日期', ink !== undefined && ink.style.nodeShape === 'name' && ink.style.monochrome && !ink.style.showDate)
const atlas = GRAPH_STYLE_PRESETS.find((preset) => preset.id === 'atlas')
check('图谱 = 不画关系名 + 网格纸', atlas !== undefined && !atlas.style.edgeLabels && atlas.style.paper === 'grid')

check('未知纸面回落点阵', normalizeGraphStyle({ paper: 'dots' as never }).paper === 'dot')
check('节点形态只认 name', normalizeGraphStyle({ nodeShape: 'round' as never }).nodeShape === 'avatar')
check('线宽下限 0.8', normalizeGraphStyle({ edgeWidth: 0 }).edgeWidth === 0.8)
check('线宽上限 3', normalizeGraphStyle({ edgeWidth: 99 }).edgeWidth === 3)
check('留白下限 24', normalizeGraphStyle({ padding: 0 }).padding === 24)
check('留白上限 240', normalizeGraphStyle({ padding: 9999 }).padding === 240)
check('倍率下限 1', normalizeGraphStyle({ scale: 0.5 }).scale === 1)
check('倍率上限 3', normalizeGraphStyle({ scale: 9 }).scale === 3)
check('NaN 不会漏出去', normalizeGraphStyle({ padding: Number.NaN, edgeWidth: Number.NaN }).padding === DEFAULT_GRAPH_STYLE.padding)
check('空输入 = 默认', JSON.stringify(normalizeGraphStyle()) === JSON.stringify(DEFAULT_GRAPH_STYLE))

console.log(`\n共 ${passed} 项断言通过`)
