/**
 * 检查 GitHub 最新 release。
 *
 * 只做「取 + 比」：请求 `releases/latest`，把 tag 解析成可比较的版本。
 * 版本比较不引第三方 semver —— 这里只需要 major.minor.patch + 预发布段，
 * 而 GitHub 的 tag 可能是 `v0.20.4-beta` / `v0.20.4-beta.1`。
 */
import { isTauri } from './env'

export const LATEST_RELEASE_URL = 'https://api.github.com/repos/Pokanshuu/OC-Studio/releases/latest'

export interface LatestRelease {
  /** 去掉前缀 v 的版本号，例如 `0.20.4-beta` */
  version: string
  /** GitHub release 页面 */
  url: string
  /** release 标题（可能为空） */
  name: string
}

export interface UpdateCheckResult {
  latest: LatestRelease
  /** 订阅版本比当前新 */
  updateAvailable: boolean
}

interface ParsedVersion {
  core: [number, number, number]
  prerelease: string[]
}

function parseVersion(input: string): ParsedVersion {
  const clean = input.trim().replace(/^v/i, '').split('+')[0]
  const [core, ...prereleaseParts] = clean.split('-')
  const numbers = core.split('.').map((part) => {
    const value = Number.parseInt(part, 10)
    return Number.isFinite(value) ? value : 0
  })
  return {
    core: [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0],
    prerelease: prereleaseParts.join('-').split('.').filter(Boolean),
  }
}

/** semver 风格比较：a > b 返回正数，a < b 返回负数，相等返回 0 */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a)
  const right = parseVersion(b)

  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) return left.core[index] - right.core[index]
  }

  // 没有预发布段 = 正式版，正式版高于同号的预发布版
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0
  if (left.prerelease.length === 0) return 1
  if (right.prerelease.length === 0) return -1

  const length = Math.max(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const l = left.prerelease[index]
    const r = right.prerelease[index]
    if (l === undefined) return -1
    if (r === undefined) return 1
    const lNumber = /^\d+$/.test(l)
    const rNumber = /^\d+$/.test(r)
    if (lNumber && rNumber) {
      const diff = Number.parseInt(l, 10) - Number.parseInt(r, 10)
      if (diff !== 0) return diff
      continue
    }
    if (lNumber !== rNumber) return lNumber ? -1 : 1
    const diff = l.localeCompare(r)
    if (diff !== 0) return diff
  }
  return 0
}

export function isNewerVersion(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0
}

/** 从 GitHub API 的 release JSON 里取需要的字段；形状不对就抛错 */
export function parseLatestRelease(raw: unknown): LatestRelease {
  if (raw === null || typeof raw !== 'object') throw new Error('GitHub 返回的数据格式不对')
  const record = raw as Record<string, unknown>
  const tag = typeof record.tag_name === 'string' ? record.tag_name.trim() : ''
  const url = typeof record.html_url === 'string' ? record.html_url.trim() : ''
  if (tag === '' || url === '') throw new Error('GitHub 没有返回有效的 release')
  return {
    version: tag.replace(/^v/i, ''),
    url,
    name: typeof record.name === 'string' ? record.name : '',
  }
}

export async function fetchLatestRelease(): Promise<LatestRelease> {
  // Tauri 里走 Rust：GitHub API 要求 User-Agent，浏览器 fetch 不允许脚本设置它。
  // 浏览器调试仍走 fetch（GitHub 对 API 开了 CORS）。
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    const body = await invoke<string>('github_latest_release')
    return parseLatestRelease(JSON.parse(body))
  }

  const response = await fetch(LATEST_RELEASE_URL, {
    cache: 'no-store',
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!response.ok) {
    throw new Error(`GitHub 返回 ${response.status} ${response.statusText}`.trim())
  }
  return parseLatestRelease(await response.json())
}

export async function checkForUpdates(currentVersion: string): Promise<UpdateCheckResult> {
  const latest = await fetchLatestRelease()
  return { latest, updateAvailable: isNewerVersion(latest.version, currentVersion) }
}
