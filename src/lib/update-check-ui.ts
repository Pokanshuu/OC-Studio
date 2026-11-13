import { toast } from 'sonner'

import { APP_VERSION } from './version'
import { openExternal } from './open-external'
import { checkForUpdates } from './update-check'

/**
 * 「检查更新」的唯一 UI 动作。
 *
 * 有新版本：提示版本号并打开 GitHub release；没有：明确说已是最新。
 * 网络 / 限流 / 数据格式错误都落到同一条失败提示里，不静默。
 */
export async function runUpdateCheck(): Promise<void> {
  try {
    const result = await checkForUpdates(APP_VERSION)
    if (result.updateAvailable) {
      toast.success(`发现新版本 ${result.latest.version}`, {
        description: '正在打开 GitHub 发布页',
      })
      await openExternal(result.latest.url)
      return
    }
    toast('已是最新版本', { description: `当前版本 ${APP_VERSION}` })
  } catch (error) {
    toast.error('检查更新失败', {
      description: error instanceof Error ? error.message : String(error),
    })
  }
}
