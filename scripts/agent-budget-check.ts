/**
 * 助手「固定前缀」预算体检。
 *
 * 每次 AGENT 请求都要为这些东西付钱，且**每一步都重放**：
 *   1. 工具 schema（`ALL_TOOLS`，模型要读）
 *   2. 能力卡片（`LIBRARY_MODEL_MARKDOWN`，系统提示词里）
 *   3. 人格（`agentInstructions`）
 *   4. 创作模式的写作手法（`writingSkillsPrompt`，只在 CREATIVE / ROLEPLAY）
 *
 * 没有尺子时「优化 token」全靠感觉：这份脚本把每一块量出来，超预算就失败。
 * 数字是**估计值**（`core/tokenEstimate`），用途是横向比较与防回归，不是账单。
 *
 * 用法：`npm run audit:agent-budget`（已串进 `audit:agent`）
 */
import {
  ALL_TOOLS,
  toOpenAiTools,
} from '../src/plugins/agent/core/agent/tools'
import { agentInstructions } from '../src/plugins/agent/core/agent/prompt'
import { DEFAULT_WRITING_SKILLS, writingSkillsPrompt } from '../src/plugins/agent/core/agent/writing'
import { LIBRARY_MODEL_MARKDOWN } from '../src/plugins/agent/host/library-model.generated'
import { estimateTokens } from '../src/plugins/agent/core/tokenEstimate'

/**
 * 预算（字符）。留了约 5% 余量：正常改描述不该撞线，加一整个工具会。
 *
 * 上一版实测：工具 18,970 + 卡片 3,527 + 人格 1,174 ≈ 23,671 字符 / 6,241 tokens。
 * 这一版目标：≤ 17,500 字符 / ≤ 4,500 tokens（约 −30%）。
 */
const BUDGETS = {
  tools: 15_200,
  guide: 1_500,
  persona: 1_300,
  total: 17_500,
  totalTokens: 4_500,
  /** 单个工具 schema 的上限：再长就该拆参数或挪进能力卡片 */
  perTool: 1_000,
  /** 单句描述的上限：超过说明在替能力卡片干活 */
  perDescription: 230,
} as const

let failures = 0

function check(name: string, actual: number, limit: number): void {
  const ok = actual <= limit
  if (!ok) failures += 1
  console.log(`${ok ? '✓' : '✗'} ${name}: ${actual} / ${limit}`)
}

const toolsJson = JSON.stringify(toOpenAiTools(ALL_TOOLS))
const guide = LIBRARY_MODEL_MARKDOWN
const persona = agentInstructions('zh')
const writing = writingSkillsPrompt('CREATIVE', DEFAULT_WRITING_SKILLS, 'zh')

const totalChars = toolsJson.length + guide.length + persona.length

console.log('助手固定前缀（每次请求、每一步都重放）')
console.log(`  工具 schema   ${String(toolsJson.length).padStart(6)} 字符  ≈${String(estimateTokens(toolsJson)).padStart(5)} tokens  (${ALL_TOOLS.length} 个工具)`)
console.log(`  能力卡片      ${String(guide.length).padStart(6)} 字符  ≈${String(estimateTokens(guide)).padStart(5)} tokens`)
console.log(`  人格          ${String(persona.length).padStart(6)} 字符  ≈${String(estimateTokens(persona)).padStart(5)} tokens`)
console.log(`  写作手法      ${String(writing.length).padStart(6)} 字符  ≈${String(estimateTokens(writing)).padStart(5)} tokens  (仅创作 / 扮演)`)
console.log(`  合计          ${String(totalChars).padStart(6)} 字符  ≈${String(estimateTokens(toolsJson + guide + persona)).padStart(5)} tokens`)
console.log('')

check('工具 schema', toolsJson.length, BUDGETS.tools)
check('能力卡片', guide.length, BUDGETS.guide)
check('人格', persona.length, BUDGETS.persona)
check('合计字符', totalChars, BUDGETS.total)
check('合计 tokens', estimateTokens(toolsJson + guide + persona), BUDGETS.totalTokens)
check('写作手法（4 项全开）', writing.length, 1_200)

const sizes = ALL_TOOLS.map((spec) => ({
  name: spec.name,
  chars: JSON.stringify(toOpenAiTools([spec])[0]).length,
  description: spec.description.length,
})).sort((a, b) => b.chars - a.chars)

console.log('\n最大的 8 个工具：')
for (const tool of sizes.slice(0, 8)) console.log(`  ${String(tool.chars).padStart(5)}  ${tool.name}`)

for (const tool of sizes) {
  if (tool.chars > BUDGETS.perTool) {
    failures += 1
    console.error(`✗ 工具 ${tool.name} 超过单工具预算：${tool.chars} / ${BUDGETS.perTool}`)
  }
  if (tool.description > BUDGETS.perDescription) {
    failures += 1
    console.error(`✗ 工具 ${tool.name} 描述超过预算：${tool.description} / ${BUDGETS.perDescription}`)
  }
}

if (failures > 0) {
  console.error(`\n助手预算体检失败：${failures} 项超限。`)
  process.exitCode = 1
} else {
  console.log('\n助手预算体检通过。')
}
