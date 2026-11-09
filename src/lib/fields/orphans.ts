'use client'

/**
 * 「被删掉的字段怎么找回」—— 数据里还在、字段表里已经没有的那些键。
 *
 * 用户删一行字段时，我们**只删表里那一行**，实体上的值一个都不动（这是刻意的：
 * 改回来就全在）。但删完之后界面上没有任何入口能把它加回来 —— 那行数据就变成
 * 「存在但看不见」。这个 hook 把差集算出来，设置页据此给一个「找回 N 项」。
 *
 * 扫的是实体自己的 `custom`（角色 / 事件 / 国家各一份；词条 / 分类条目共用 `WorldEntry.custom`），
 * 不读正文：正文里的东西不是字段。
 */
import { useEffect, useState } from 'react'
import { db } from '@/lib/db'
import { isCustomField, type FieldDef, type FieldKind } from './types'

/** 采集某一类实体上出现过的自定义键（含软删除的行 —— 数据还在，就该找回） */
async function collectCustomKeys(kind: FieldKind): Promise<string[]> {
  const keys = new Set<string>()
  const add = (custom: Record<string, string> | undefined): void => {
    if (!custom) return
    for (const [key, value] of Object.entries(custom)) {
      if (key.trim() === '') continue
      // 空值不算「有数据」，否则删掉的行会永远显示成可找回
      if (typeof value !== 'string' || value.trim() === '') continue
      keys.add(key)
    }
  }

  if (kind === 'character') {
    for (const row of await db.characters.toArray()) add(row.custom)
  } else if (kind === 'event') {
    for (const row of await db.events.toArray()) add(row.custom)
  } else if (kind === 'country') {
    for (const row of await db.countries.toArray()) add(row.custom)
  } else {
    for (const row of await db.worldEntries.toArray()) add(row.custom)
  }
  return [...keys]
}

export interface OrphanFields {
  /** 有数据但字段表里没有的键（按出现顺序） */
  keys: string[]
  loading: boolean
}

export function useOrphanFieldKeys(kind: FieldKind, configured: readonly FieldDef[]): OrphanFields {
  const [allKeys, setAllKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    void collectCustomKeys(kind)
      .then((keys) => {
        if (alive) setAllKeys(keys)
      })
      .catch((error: unknown) => {
        console.warn('[fields] 读取自定义键失败', error)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [kind])

  const known = new Set(
    configured
      .filter((field) => isCustomField(field))
      .map((field) => field.key ?? field.id),
  )
  return { keys: allKeys.filter((key) => !known.has(key)), loading }
}
