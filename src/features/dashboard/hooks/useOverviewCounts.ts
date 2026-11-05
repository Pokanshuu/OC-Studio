'use client'

import { useEffect, useState } from 'react'
import { DATA_UPDATED_EVENT } from '@/lib/data-events'
import { listNovelEntries } from '@/features/novel/services'
import { listMaps } from '@/features/map/services'

export interface OverviewCounts {
  /** 作品数（章节不算 —— 一部 12 章的书是 1，不是 13） */
  novels: number
  maps: number
}

const EMPTY: OverviewCounts = { novels: 0, maps: 0 }

/**
 * 概览里「小说 / 地图」两个数。
 *
 * 它们不是独立的表：小说和地图都是 `worldEntries` 里的笔记（靠 `category` 区分），
 * 而 `useEntryList` 只返回设定类词条（小说 / 地图已被过滤掉），所以数量得单独取。
 * 数据源就是各板块自己在用的那两个服务，创建 / 删除后靠 `DATA_UPDATED_EVENT` 重读。
 */
export function useOverviewCounts(): OverviewCounts {
  const [counts, setCounts] = useState<OverviewCounts>(EMPTY)

  useEffect(() => {
    let alive = true

    const read = async () => {
      const [novels, maps] = await Promise.all([listNovelEntries(), listMaps()])
      if (!alive) return
      setCounts({
        novels: novels.filter((entry) => entry.parentId === null).length,
        maps: maps.length,
      })
    }

    void read()
    window.addEventListener(DATA_UPDATED_EVENT, read)
    return () => {
      alive = false
      window.removeEventListener(DATA_UPDATED_EVENT, read)
    }
  }, [])

  return counts
}
