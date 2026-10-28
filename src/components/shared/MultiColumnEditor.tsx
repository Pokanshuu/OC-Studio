import type { ReactNode } from 'react'

interface MultiColumnEditorProps {
  railOpen: boolean
  rail: ReactNode
  meta: ReactNode
  children: ReactNode
}

/**
 * 三栏编辑器的公共壳：220 左栏（可收起）/ 340 中栏 / 余量右栏。
 * 每栏各自滚动；内容与数据由各实体编辑器提供。
 */
export function MultiColumnEditor({ railOpen, rail, meta, children }: MultiColumnEditorProps) {
  return (
    <div className="flex min-h-0 flex-1">
      {railOpen ? (
        <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-line">{rail}</aside>
      ) : null}
      <section className="w-[340px] shrink-0 overflow-y-auto border-r border-line">{meta}</section>
      {children}
    </div>
  )
}
