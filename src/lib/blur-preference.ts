/**
 * 「窗口模糊」偏好的**唯一读写入口**。
 *
 * 默认值 = **开**：支持的系统（Windows 11 的 Mica、macOS 的 vibrancy）装好就该有
 * 毛玻璃，不该让用户先去设置里翻开关。只有用户**手动关掉**时才写 `'false'`，
 * 之后一直按关处理。
 *
 * 注意这里只管「用户想不想要」，**能力判断在 Rust 侧**（`blur_supported` /
 * `init_blur` 自己会在不支持的平台返回 false）。两者分开的原因：
 * 偏好要跟着用户走（换系统、换机器还在），能力只跟当前机器有关。
 */
const KEY = 'blur-effect-enabled'

/** 读偏好。没写过 / 读不出来 → 开。 */
export function readBlurPreference(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(KEY) !== 'false'
  } catch {
    return true
  }
}

/** 写偏好。用户显式开关时才调。 */
export function writeBlurPreference(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, String(enabled))
  } catch {
    /* 隐私模式下写不进去：下次启动回到默认开，无害 */
  }
}
