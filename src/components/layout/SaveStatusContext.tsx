'use client'

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved'
export type EditorEntityType = 'character' | 'event' | 'country' | 'world'

interface SaveStatusContextValue {
  status: SaveStatus
  markSaving: () => void
  /** 由表单按「当前数据 ≠ 已保存数据」推送；不要手工调用，见 lib/dirty.ts */
  reportDirty: (dirty: boolean) => void
  resetStatus: () => void
  registerSaveHandler: (type: EditorEntityType, fn: (() => void) | null) => void
  setActiveEntity: (type: EditorEntityType | null) => void
  requestSave: () => void
}

const SaveStatusContext = createContext<SaveStatusContextValue>({
  status: 'idle',
  markSaving: () => {},
  reportDirty: () => {},
  resetStatus: () => {},
  registerSaveHandler: () => {},
  setActiveEntity: () => {},
  requestSave: () => {},
})

export function useSaveStatus(): SaveStatusContextValue {
  return useContext(SaveStatusContext)
}

export function SaveStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const handlersRef = useRef<Partial<Record<EditorEntityType, () => void>>>({})
  const activeRef = useRef<EditorEntityType | null>(null)
  const savingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearSavingTimer = useCallback(() => {
    if (savingTimerRef.current !== null) {
      clearTimeout(savingTimerRef.current)
      savingTimerRef.current = null
    }
  }, [])

  /**
   * 进入「保存中」。带兜底：若 20 秒内没人把状态推回去（保存抛错 /
   * 某个表单忘了上报），退回「未保存」，绝不让状态栏无限转圈。
   */
  const markSaving = useCallback(() => {
    clearSavingTimer()
    setStatus('saving')
    savingTimerRef.current = setTimeout(() => {
      savingTimerRef.current = null
      setStatus((prev) => (prev === 'saving' ? 'dirty' : prev))
    }, 20_000)
  }, [clearSavingTimer])

  const resetStatus = useCallback(() => {
    clearSavingTimer()
    setStatus('idle')
  }, [clearSavingTimer])

  /**
   * 干净时不无条件写 'idle'：没动过的编辑器保持 idle（不要显示「已保存」），
   * 刚保存完的则落到 'saved'。
   */
  const reportDirty = useCallback((dirty: boolean) => {
    if (!dirty) clearSavingTimer()
    setStatus((prev) => {
      if (dirty) return 'dirty'
      if (prev === 'dirty' || prev === 'saving') return 'saved'
      return prev
    })
  }, [clearSavingTimer])

  const registerSaveHandler = useCallback((type: EditorEntityType, fn: (() => void) | null) => {
    if (fn) {
      handlersRef.current[type] = fn
    } else {
      delete handlersRef.current[type]
    }
  }, [])

  const setActiveEntity = useCallback((type: EditorEntityType | null) => {
    activeRef.current = type
  }, [])

  const requestSave = useCallback(() => {
    const active = activeRef.current
    if (active) handlersRef.current[active]?.()
  }, [])

  return (
    <SaveStatusContext.Provider
      value={{ status, markSaving, reportDirty, resetStatus, registerSaveHandler, setActiveEntity, requestSave }}
    >
      {children}
    </SaveStatusContext.Provider>
  )
}
