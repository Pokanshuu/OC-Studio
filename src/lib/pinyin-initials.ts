/**
 * 汉字与名字的拼音首字母。
 *
 * 用途：`@` 引用与 `[[` 内链的补全允许用拉丁字母按拼音首字母检索
 * （`reference-registry.ts` 中的第二路匹配，`al` → 艾拉）。
 *
 * 实现方式：不引入拼音字典。ICU 的中文排序规则（`zh-Hans-u-co-pinyin`）按拼音排列汉字，
 * 下列锚点字分别是 `a`–`z` 各组的最小音节（`i` / `u` / `v` 不作声母，`z` 组以 `zuo` 收尾）；
 * 对目标字二分比较，落在哪个锚点之后即属于哪个首字母组。该排序规则由 Chromium / WebView2 /
 * WKWebView 与 Node（full-icu）提供，因此不增加包体积，也不需要构建期生成字典。
 *
 * 已知限制：
 * - 多音字只取 ICU 选定的读音（曾 → c、查 → c、单 → d、仇 → c、翟 → d）。
 *   姓氏读音与之不同的字，按另一个首字母检索不到；按汉字检索不受影响。
 * - ICU 未收录的罕用字返回空串，该字符不参与首字母匹配。
 * - 只提供首字母，不提供全拼：`aila` / `kaier` 不匹配。
 */

interface InitialAnchor {
  /** 该组的拼音首字母 */
  letter: string
  /** 该组最小音节的代表字 */
  anchor: string
}

const ANCHORS: ReadonlyArray<InitialAnchor> = [
  { letter: 'a', anchor: '阿' },
  { letter: 'b', anchor: '八' },
  { letter: 'c', anchor: '擦' },
  { letter: 'd', anchor: '搭' },
  { letter: 'e', anchor: '鹅' },
  { letter: 'f', anchor: '发' },
  { letter: 'g', anchor: '噶' },
  { letter: 'h', anchor: '哈' },
  { letter: 'j', anchor: '击' },
  { letter: 'k', anchor: '喀' },
  { letter: 'l', anchor: '拉' },
  { letter: 'm', anchor: '妈' },
  { letter: 'n', anchor: '拿' },
  { letter: 'o', anchor: '哦' },
  { letter: 'p', anchor: '啪' },
  { letter: 'q', anchor: '七' },
  { letter: 'r', anchor: '然' },
  { letter: 's', anchor: '撒' },
  { letter: 't', anchor: '他' },
  { letter: 'w', anchor: '挖' },
  { letter: 'x', anchor: '昔' },
  { letter: 'y', anchor: '压' },
  { letter: 'z', anchor: '匝' },
]

/** `a` 组的起点。排序在它之前的汉字无法归类 */
const ANCHOR_FIRST = '阿'

/** `z` 组的终点音节（`zuo`）。排序在它之后的汉字说明 ICU 没有收录读音 */
const ANCHOR_END = '作'

/** 单字结果缓存：补全每敲一个键都要重算整份名字，缓存把开销压到一次比较表 */
const initialCache = new Map<string, string>()

let collator: Intl.Collator | null | undefined

/** ICU 拼音排序器；运行环境缺少该规则时返回 null，此后所有汉字都按「无法判定」处理 */
function getCollator(): Intl.Collator | null {
  if (collator !== undefined) return collator
  try {
    collator = new Intl.Collator('zh-Hans-u-co-pinyin')
  } catch {
    collator = null
  }
  return collator
}

/** 只有 CJK 汉字区参与判定：字母 / 数字 / 假名 / 符号没有拼音首字母 */
function isHanzi(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  return (
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff)
  )
}

/** 单个汉字的拼音首字母；非汉字、多音字以外的未知字返回空串 */
export function pinyinInitial(char: string): string {
  const cached = initialCache.get(char)
  if (cached !== undefined) return cached
  const initial = detectInitial(char)
  initialCache.set(char, initial)
  return initial
}

/** 整串名字的拼音首字母：`艾拉` → `al`；非汉字字符跳过 */
export function pinyinInitials(text: string): string {
  let initials = ''
  for (const char of text) initials += pinyinInitial(char)
  return initials
}

/** 纯拉丁字母的查询（大小写不限）。只有这类查询才尝试拼音首字母匹配 */
export function isLatinQuery(query: string): boolean {
  return /^[a-z]+$/i.test(query)
}

function detectInitial(char: string): string {
  if (!isHanzi(char)) return ''
  const order = getCollator()
  if (!order) return ''
  if (order.compare(char, ANCHOR_FIRST) < 0) return ''
  if (order.compare(char, ANCHOR_END) > 0) return ''

  let low = 0
  let high = ANCHORS.length - 1
  let matched = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    const entry = ANCHORS[middle]
    if (entry && order.compare(char, entry.anchor) >= 0) {
      matched = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return matched < 0 ? '' : ANCHORS[matched].letter
}
