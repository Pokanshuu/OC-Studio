/**
 * OC 动画（视频）上传：落盘 + 返回可预览的路径。
 *
 * 三环境：
 * - **Tauri**：写进 vault 的 `附件/`。不把字节直接过 IPC —— `vault_write_bytes`
 *   收的是 `number[]`，一个 50MB 的视频会被 JSON 序列化成几百 MB 文本。
 *   改走「先落 appData 暂存文件 → `vault_import_file` 原生复制」，
 *   和 `image-service.ts` 里图片上传同一条链。
 * - **Capacitor**：没有 vault（`isVaultSupported()` 只认桌面），落到设备存储的
 *   `附件/`，返回 `file://` URI（`resolveImageUrl` 认识，能直接喂 `<video>`）。
 * - **浏览器预览**：没有库可写，只能给会话内的 blob URL，标 `ephemeral: true`，
 *   **调用方不该把它写库**（刷新即死链）。
 *
 * 失败一律抛错（空文件 / 超限 / 写盘失败 / 没开库），不静默退化成 blob。
 */
import { isCapacitor, isTauri } from '@/lib/env'
import { vaultFs } from '@/lib/vault/vault-fs'
import { getVaultSession } from '@/lib/vault/vault-session'

const ANIMATION_DIR = '附件'

/** 单个动画上限。再大就不适合 base64 / IPC 搬了（见文件头注释）。 */
export const MAX_ANIMATION_BYTES = 200 * 1024 * 1024
export const MAX_ANIMATION_MB = MAX_ANIMATION_BYTES / 1024 / 1024

const VIDEO_EXT = /\.(mp4|m4v|webm|mov|ogv|mkv|avi)$/i

export type AnimationUploadResult =
  /** 已落盘（vault 的 `附件/` 或设备存储），可以写库 */
  | { path: string; ephemeral: false }
  /** 浏览器预览的 blob：只在本会话有效，**不要写库** */
  | { path: string; ephemeral: true }

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name)
  return match ? match[1].toLowerCase() : 'mp4'
}

function assertAcceptable(file: File): void {
  if (file.size === 0) throw new Error('这个文件是空的')
  if (file.size > MAX_ANIMATION_BYTES) {
    throw new Error(`动画不能超过 ${MAX_ANIMATION_MB}MB`)
  }
  if (file.type && !file.type.startsWith('video/') && !VIDEO_EXT.test(file.name)) {
    throw new Error('只能上传视频文件')
  }
}

function animationName(file: File): string {
  return `动画-${Date.now()}.${extensionOf(file.name)}`
}

/** 读成 base64（Capacitor 原生侧只收 base64，Blob 只在 Web 端支持） */
function readAsBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取这个视频失败'))
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('读取这个视频失败'))
        return
      }
      const comma = result.indexOf(',')
      resolve(comma === -1 ? result : result.slice(comma + 1))
    }
    reader.readAsDataURL(file)
  })
}

/** 暂存到 appData：`vault_import_file` 需要一个**磁盘上的源路径** */
async function stageInAppData(file: File, name: string): Promise<string> {
  const { appDataDir } = await import('@tauri-apps/api/path')
  const { mkdir, writeFile } = await import('@tauri-apps/plugin-fs')
  const dir = `${(await appDataDir()).replace(/[\\/]+$/, '')}/videos`
  try {
    await mkdir(dir, { recursive: true })
  } catch {
    // 目录已存在
  }
  const staging = `${dir}/${name}`
  await writeFile(staging, new Uint8Array(await file.arrayBuffer()))
  return staging
}

/**
 * 清掉 appData 里的暂存文件（`capabilities/default.json` 已放行 `fs:allow-remove` @ `$APPDATA/**`）。
 * 清不掉不算上传失败（vault 里那份已经写好了），但**不能静默**：一个 200MB 的暂存视频
 * 留在 appData 就是纯泄漏，至少留一行日志。
 */
async function dropStaging(staging: string): Promise<void> {
  try {
    const { remove } = await import('@tauri-apps/plugin-fs')
    await remove(staging)
  } catch (error) {
    console.warn('[uploadAnimation] 暂存文件没删掉:', staging, error)
  }
}

async function uploadToVault(file: File, name: string): Promise<AnimationUploadResult> {
  const session = getVaultSession()
  if (session === null) throw new Error('还没有打开笔记库')
  const staging = await stageInAppData(file, name)
  const relPath = `${ANIMATION_DIR}/${name}`
  try {
    await vaultFs.importFile(session.root, staging, relPath)
  } finally {
    await dropStaging(staging)
  }
  return { path: relPath, ephemeral: false }
}

async function uploadToDevice(file: File, name: string): Promise<AnimationUploadResult> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const relPath = `${ANIMATION_DIR}/${name}`
  await Filesystem.writeFile({
    path: relPath,
    data: await readAsBase64(file),
    directory: Directory.Data,
    recursive: true,
  })
  const { uri } = await Filesystem.getUri({ path: relPath, directory: Directory.Data })
  return { path: uri || relPath, ephemeral: false }
}

export async function uploadAnimation(file: File): Promise<AnimationUploadResult> {
  assertAcceptable(file)
  const name = animationName(file)

  if (isTauri()) return uploadToVault(file, name)
  if (isCapacitor()) return uploadToDevice(file, name)

  // 浏览器预览：没有库可写，只能用会话内的 blob
  return { path: URL.createObjectURL(file), ephemeral: true }
}
