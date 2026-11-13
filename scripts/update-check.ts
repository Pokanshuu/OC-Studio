/**
 * 检查更新的版本比较自检（`npm run audit:update`）。
 *
 * 只测纯函数：tag 解析、v 前缀、预发布段排序、build 元数据。
 * 网络请求不在自检里（抓 GitHub 会受限流与环境影响）。
 */
import {
  compareVersions,
  isNewerVersion,
  parseLatestRelease,
} from '../src/lib/update-check'

let passed = 0
const failures: string[] = []

function check(name: string, condition: boolean): void {
  if (condition) {
    passed += 1
    return
  }
  failures.push(name)
}

check('相同版本 = 0', compareVersions('0.20.4-beta', '0.20.4-beta') === 0)
check('v 前缀不影响比较', compareVersions('v0.20.4-beta', '0.20.4-beta') === 0)
check('patch 更大 = 新版本', compareVersions('0.20.5-beta', '0.20.4-beta') > 0)
check('minor 更大 = 新版本', compareVersions('0.21.0', '0.20.9') > 0)
check('旧版本返回负数', compareVersions('0.20.3', '0.20.4') < 0)
check('正式版高于同号 beta', compareVersions('0.20.4', '0.20.4-beta') > 0)
check('beta.1 高于 beta', compareVersions('0.20.4-beta.1', '0.20.4-beta') > 0)
check('beta.10 高于 beta.2（数字比较）', compareVersions('0.20.4-beta.10', '0.20.4-beta.2') > 0)
check('build 元数据不参与比较', compareVersions('0.20.4+abc', '0.20.4+def') === 0)
check('isNewerVersion 认新版本', isNewerVersion('0.20.5-beta', '0.20.4-beta'))

const release = parseLatestRelease({
  tag_name: 'v0.20.4-beta',
  html_url: 'https://github.com/Pokanshuu/OC-Studio/releases/tag/v0.20.4-beta',
  name: 'v0.20.4-beta',
})
check('解析 tag 去掉 v', release.version === '0.20.4-beta')
check('解析 release 页面', release.url.endsWith('/v0.20.4-beta'))
check(
  '缺 tag / html_url 时抛错',
  (() => {
    try {
      parseLatestRelease({ tag_name: 'v0.20.4' })
      return false
    } catch {
      return true
    }
  })(),
)

if (failures.length > 0) {
  console.error(`检查更新自检失败 ${failures.length}/${passed + failures.length}：`)
  for (const name of failures) console.error(`  ✗ ${name}`)
  process.exit(1)
}

console.log(`检查更新自检通过：${passed} 项断言`)
