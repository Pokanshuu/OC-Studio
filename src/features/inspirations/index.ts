/**
 * 灵感的唯一入口是顶栏便签（`InspirationQuickNote`）—— 侧栏与整页已移除。
 * 这里只做对外导出；保存逻辑在 `use-inspiration-draft.ts`，数据在 `store.ts`。
 */
export { InspirationQuickNote } from './components/InspirationQuickNote'
export { useInspirations, loadInspirations } from './store'
export type { Inspiration } from './types'
