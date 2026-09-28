/**
 * 界面原子类 —— 全局唯一的样式片段定义。
 *
 * 「一定要统一」：列表页 / 编辑器 / 浮层的同类控件都从这里取类名，
 * 不再在各自文件里就地拼写，避免出现 48px 与 40px、描边与描边宽度不一致这类漂移。
 *
 * 铁律（OC Studio 界面语言）
 * - 零圆角（圆形头像除外）
 * - 控件零描边：输入框只有一条底线；线只用于区块之间 / 表格行 / 浮层边界 / 空态占位框
 * - 三级灰：ink / ink-muted / ink-faint
 */

/* ── 字段行 ─────────────────────────────────────────────
   标签在左（固定 64px），内容在右，行间 1px 线。 */
export const FIELD_ROW = 'flex items-center gap-3 border-b border-line py-1.5'
export const FIELD_ROW_TOP = 'flex items-start gap-3 border-b border-line py-1.5'
export const FIELD_LABEL = 'w-16 shrink-0 text-sm text-ink-muted'
/** 竖排表单里的标签（弹窗/设置） */
export const FIELD_LABEL_BLOCK = 'mb-1.5 block text-[13px] text-ink-muted'

/* ── 区块标题 ───────────────────────────────────────────
   衬线 15px：靠字族而非字号与 14px 的字段标签拉开层级。 */
export const SECTION_TITLE = 'mb-3 font-serif text-[15px] font-bold tracking-[-0.01em] text-ink'
/** 同行右侧还要放控件时用（自己控制 spacing） */
export const SECTION_TITLE_BARE = 'font-serif text-[15px] font-bold tracking-[-0.01em] text-ink'

/* ── 顶栏 / 页头 ───────────────────────────────────────
   页头统一 48px；页面标题统一 18px 衬线加粗（列表页 / 编辑器 / 浮层共用）。 */
export const BAR_H = 'h-12'
export const PAGE_TITLE = 'text-lg text-ink font-serif font-bold tracking-[-0.01em]'
export const BAR_TITLE = PAGE_TITLE

/* ── 图标按钮 ───────────────────────────────────────── */
export const ICON_BTN =
  'flex h-6 w-6 shrink-0 items-center justify-center text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink'
export const ICON_BTN_SM =
  'flex h-5 w-5 shrink-0 items-center justify-center text-ink-faint transition-colors hover:bg-[var(--oc-hover)] hover:text-ink'

/* ── 按钮 ─────────────────────────────────────────────
   主按钮 = 实心墨色（与列表页「新建」同规格）；次按钮 = 纯文字。 */
export const BTN_PRIMARY =
  'touch-feedback flex h-8 shrink-0 items-center gap-1.5 bg-ink px-3 text-[13px] text-paper transition-opacity hover:bg-ink hover:opacity-85 disabled:opacity-40'
export const BTN_QUIET =
  'flex h-8 shrink-0 items-center gap-1.5 px-1.5 text-[13px] text-ink-muted transition-colors hover:text-ink'
export const BTN_BLOCK =
  'touch-feedback flex h-8 w-full items-center justify-center gap-1.5 border border-dashed border-line text-[13px] text-ink-faint transition-colors hover:border-line-hover hover:text-ink'

/* ── 输入 ─────────────────────────────────────────────
   零描边：静默态只留一条极淡的线，聚焦时加深。 */
export const INPUT_LINE =
  'w-full border-b border-line bg-transparent px-0 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-line-hover focus:outline-none'
export const INPUT_BARE =
  'w-full border-b border-transparent bg-transparent px-0 text-sm text-ink placeholder:text-ink-faint transition-colors hover:border-line focus:border-line-hover focus:outline-none'

/* ── 浮层 ─────────────────────────────────────────────
   只有浮层允许有边框；一律无阴影，靠半透明 + 模糊与内容分层。 */
export const PANEL = 'border border-line bg-paper/85 backdrop-blur-lg shadow-none'
export const MENU = 'border border-line bg-paper/85 backdrop-blur-lg p-1 shadow-none'
export const MENU_ITEM =
  'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-[var(--oc-hover)]'
export const MENU_GROUP_LABEL = 'px-2.5 py-1 text-[11px] tracking-[0.08em] text-ink-faint'

/* ── chip ─────────────────────────────────────────────
   方形、无描边、低对比底色；选中态反相为实心墨色。 */
export const CHIP = 'inline-flex items-center gap-1 bg-paper-alt px-2 py-[3px] text-[12px] text-ink-muted'
export const CHIP_ON = 'inline-flex items-center gap-1 bg-ink px-2 py-[3px] text-[12px] text-paper'

/* ── 空态 / 加载 ─────────────────────────────────────── */
export const EMPTY_STATE = 'flex flex-1 flex-col items-center justify-center gap-2 py-24'
export const EMPTY_TITLE = 'font-serif text-sm text-ink-faint'
export const LOADING_TEXT = 'text-[13px] text-ink-faint'
