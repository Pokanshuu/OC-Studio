import { db } from '@/lib/db'
import { pendingStamp } from '@/lib/sync'
import type { ProjectMeta } from '@/types'

/** 单例记录固定主键 */
const META_ID = 1

export const DEFAULT_PROJECT_META: Omit<ProjectMeta, 'id' | 'updatedAt'> = {
  worldName: '',
  tagline: '',
  coverUrl: '',
}

export type ProjectMetaPatch = Partial<Pick<ProjectMeta, 'worldName' | 'tagline' | 'coverUrl'>>

/**
 * 写入串行队列。
 * 元信息是「读—改—写」的合并写入，若并发调用（例如同一帧内连续修改两个字段），
 * 各自读到旧行再写回会互相覆盖 —— 必须串行化。
 */
let writeQueue: Promise<void> = Promise.resolve()

/** 读取项目元信息（始终以库内为准，导入/外部写入后可立即看到）。 */
export async function getProjectMeta(): Promise<ProjectMeta> {
  // 等待进行中的写入，避免读到半程状态
  await writeQueue.catch(() => {})
  const row = await db.meta.get(META_ID)
  if (row) return row
  return { id: META_ID, ...DEFAULT_PROJECT_META, updatedAt: 0 }
}

export function updateProjectMeta(patch: ProjectMetaPatch): Promise<void> {
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      const existing = await db.meta.get(META_ID)
      const now = Date.now()
      const defined = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      )
      await db.meta.put({
        id: META_ID,
        worldName: existing?.worldName ?? '',
        tagline: existing?.tagline ?? '',
        coverUrl: existing?.coverUrl ?? '',
        ...defined,
        updatedAt: now,
        ...pendingStamp(now),
      })
    })
  return writeQueue
}
