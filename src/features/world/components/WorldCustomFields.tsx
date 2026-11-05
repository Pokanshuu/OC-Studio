'use client'

/**
 * 词条的自定义字段（「基本信息」组内的 atom）。
 *
 * 字段表在 设置 › 世界 › 自定义组件 › 基本信息 里维护；这里只渲染
 * `WorldEntry.custom` 对应的那几行。分类条目（宠物 / 武器）也用它补字段，
 * 因此编辑器和分类编辑器共用同一份实现，不各写一套。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { WorldEntry } from '@/types'
import { useFields, type FieldDef } from '@/lib/fields'
import { updateEntry } from '@/features/world/services'
import { FIELD_INPUT, FIELD_LABEL, FIELD_ROW, LIST_END } from '@/lib/ui-tokens'

export function WorldCustomFields({ entry, fieldKeys }: { entry: WorldEntry; fieldKeys?: string[] }) {
  const configured = useFields('worldEntry').filter((field) => field.key !== undefined)
  /** 模板声明了字段就只显示那几行；没声明时回落到字段表里的全部自定义字段 */
  const fields = useMemo<FieldDef[]>(() => {
    if (fieldKeys === undefined) return configured
    const byKey = new Map(configured.map((field) => [field.key as string, field]))
    return fieldKeys.map(
      (key): FieldDef => byKey.get(key) ?? { id: `template-${key}`, label: key, type: 'text', key },
    )
  }, [configured, fieldKeys])
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...(entry.custom ?? {}) }))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRef = useRef(values)
  const savedRef = useRef<Record<string, string>>({ ...(entry.custom ?? {}) })

  const flush = useCallback(async (next: Record<string, string>) => {
    if (JSON.stringify(next) === JSON.stringify(savedRef.current)) return
    try {
      await updateEntry(entry.id, { custom: next })
      savedRef.current = next
    } catch (err) {
      toast.error('字段保存失败', { description: err instanceof Error ? err.message : String(err) })
    }
  }, [entry.id])

  const handleChange = (key: string, value: string): void => {
    const next = { ...latestRef.current, [key]: value }
    latestRef.current = next
    setValues(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      void flush(latestRef.current)
    }, 700)
  }

  // 切条目 / 卸载时把防抖中的值补上
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
      void flush(latestRef.current)
    }
  }, [flush])

  if (fields.length === 0) return null

  return (
    <div className={`flex flex-col ${LIST_END}`}>
      {fields.map((field) => {
        const key = field.key
        if (key === undefined) return null
        return (
          <div key={field.id} className={FIELD_ROW}>
            <span className={FIELD_LABEL}>{field.label}</span>
            <input
              type="text"
              value={values[key] ?? ''}
              onChange={(event) => handleChange(key, event.target.value)}
              className={`${FIELD_INPUT} min-w-0 flex-1`}
            />
          </div>
        )
      })}
    </div>
  )
}
