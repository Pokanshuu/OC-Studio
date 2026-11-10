/**
 * Built-in writing skills.
 *
 * These are **prompt fragments**, not tools: they only shape how the model writes.
 * They are injected in CREATIVE / ROLEPLAY modes, after the persona and before the
 * per-conversation data, so the static prefix stays byte-stable and cache-friendly.
 *
 * Why skills instead of one longer persona: craft advice is task-dependent. A scene
 * needs goal/conflict/turn; a dialogue pass needs voice/subtext/beats; a continuity
 * pass must happen **before** rewriting rather than after. Bundling all of it into
 * every prompt both dilutes the persona and charges tokens to conversations that do
 * not need it (the settings list lets the author turn each one off).
 *
 * Content is distilled from established craft guidance: Dwight V. Swain's
 * scene/sequel (goal–conflict–disaster; reaction–dilemma–decision) as taught by
 * Randy Ingermanson, and the standard show-don't-tell / filter-word / POV rules.
 * Sources: https://www.advancedfictionwriting.com/articles/writing-the-perfect-scene/
 *          https://www.advancedfictionwriting.com/blog/2010/08/26/understanding-showing-and-telling/
 *          https://www.advancedfictionwriting.com/blog/2008/06/25/subtext-in-dialogue/
 */

import type { ConversationMode } from '../types'

export type WritingSkillId = 'scene' | 'dialogue' | 'pacing' | 'continuity'

export interface WritingSkill {
  id: WritingSkillId
  label: { zh: string; en: string }
  /** UI hint: one line, what it buys */
  hint: { zh: string; en: string }
  /** Injected verbatim. Keep ≤ 160 chars per language: it is paid on every turn. */
  prompt: { zh: string; en: string }
}

export const WRITING_SKILLS: readonly WritingSkill[] = [
  {
    id: 'scene',
    label: { zh: '场景推进', en: 'Scene' },
    hint: { zh: '目标 / 阻碍 / 不可逆的转折', en: 'goal, obstacle, irreversible turn' },
    prompt: {
      zh: '场景先定三件事：谁想要什么、什么挡着他、失败会失去什么。开头两句亮出具体目标，让人物主动出手；中段用可感知的物件、声音、气味把人按在现场，阻碍逐级加码；结尾必须有一次不可逆的转折——付代价、丢筹码或泄底牌，并留下后果推向下一场。能演的不要讲，该演的绝不概述。',
      en: 'Scene: who wants what, what blocks it, what failing costs. State the goal early, escalate, ground it in object, sound, smell, end on a turn they cannot undo. Dramatize, never summarize.',
    },
  },
  {
    id: 'dialogue',
    label: { zh: '对白', en: 'Dialogue' },
    hint: { zh: '各自的口吻与字面下的真意', en: 'voice and subtext' },
    prompt: {
      zh: '对白先问：这句他非说不可吗？每句话要听得出是谁在说——用词、句长、口头习惯区分人物；真意压在字面之下，让人物绕着要害说。用动作节拍代替“他愤怒地说”，提示语能删就删，只留“说”。禁止借对话交代设定与前史，该让读者知道的信息，由冲突自己挤出来。',
      en: 'Only this person could say this line. Split voices by diction, rhythm, tics; bury the real meaning. Action beats over adverbs; tags stay "said". Never explain the world in talk.',
    },
  },
  {
    id: 'pacing',
    label: { zh: '节奏与视角', en: 'Pacing & POV' },
    hint: { zh: '长短句、场景与概述、单一视角', en: 'sentence rhythm, scene vs summary, one POV' },
    prompt: {
      zh: '节奏靠长短交替：紧张处用短句、实词、动作；过渡用一句概述跳过，别把走路吃饭写成场景。一场戏只跟一个视角人物的感官与认知，不写他看不见、想不到的事。删净滤镜词——“她看到”“她感到”“她注意到”“似乎”——直接给画面。段落收尾留一个钩子。',
      en: 'Vary sentence length: short and concrete under pressure, one-line summary for transitions. One POV per scene, limited to what they can perceive. Cut filters (saw, felt, noticed); give the image.',
    },
  },
  {
    id: 'continuity',
    label: { zh: '一致性检查', en: 'Continuity' },
    hint: { zh: '改写前先列冲突，不自行补设定', en: 'list conflicts first, never invent canon' },
    prompt: {
      zh: '先列事实清单：人名、称呼、时间线、地点、伤情、物品、规则，一律以用户给定的设定为准。改写前逐条比对，先列出冲突项（出处＋冲突点），再动笔。设定没写的，标注“设定未载”，绝不自行补写或圆场；改动取最小，且不得顺手改动别处设定。',
      en: 'Fact sheet first: names, address forms, timeline, place, injuries, objects, rules - canon as given. List contradictions before rewriting. Canon silent? Mark "not in canon"; never invent.',
    },
  },
]

export const DEFAULT_WRITING_SKILLS: WritingSkillId[] = ['scene', 'dialogue', 'pacing', 'continuity']

/** Role-play is in-character: continuity is a meta pass, so it is excluded there. */
function appliesTo(mode: ConversationMode, id: WritingSkillId): boolean {
  if (mode === 'CREATIVE') return true
  if (mode === 'ROLEPLAY') return id !== 'continuity'
  return false
}

/**
 * The block appended after the persona. Empty when nothing applies or nothing is
 * enabled — an empty block is still worth avoiding, hence the length check.
 */
export function writingSkillsPrompt(
  mode: ConversationMode,
  enabled: readonly string[],
  language: 'zh' | 'en',
): string {
  const picked = WRITING_SKILLS.filter(
    (skill) => enabled.includes(skill.id) && appliesTo(mode, skill.id),
  )
  if (picked.length === 0) return ''
  const heading = language === 'zh' ? '# 写作手法（按需执行，与人格冲突时以人格为准）' : '# Writing craft (apply as relevant; persona wins on conflict)'
  const lines = picked.map((skill) => `- ${language === 'zh' ? skill.label.zh : skill.label.en}：${skill.prompt[language]}`)
  const example =
    language === 'zh'
      ? '\n示例（告知 → 演出）：她很生气，觉得被背叛了 → 她把杯子放回桌上，比平时重了一点：“你什么时候知道的？”'
      : '\nExample (tell → show): She was angry and felt betrayed. → She set the cup down harder than usual. "When did you find out?"'
  return [heading, ...lines, example].join('\n')
}
