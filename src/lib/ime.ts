/**
 * 输入法（IME）组字期间按键的判定。
 *
 * 中文 / 日文输入时，回车是**选中候选词**，Esc 是**取消组字** —— 而不是「提交」「关闭」。
 * 但 `keydown` 照样会派发，于是：
 * - 在「新建文件夹」「重命名」这类输入框里敲拼音按回车 → 提交的是**拼音**（`xinyhijian`），
 *   建出一个名字错误的条目；
 * - 按 Esc 想取消候选 → 对话框直接关掉，刚输入的内容没了。
 *
 * 判定两种形态：现代浏览器给 `event.nativeEvent.isComposing === true`；
 * 老 WebView（WebView2 早期 / Android 输入法）常常只有 `keyCode === 229`，
 * 两个都要认，否则在那些环境里拦不住。
 */
type MaybeComposing = {
  isComposing?: boolean
  keyCode?: number
  nativeEvent?: { isComposing?: boolean; keyCode?: number }
}

export function isImeComposing(event: MaybeComposing): boolean {
  if (event.nativeEvent?.isComposing === true) return true
  if (event.isComposing === true) return true
  if (event.nativeEvent?.keyCode === 229) return true
  return event.keyCode === 229
}
