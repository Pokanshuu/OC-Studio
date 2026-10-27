/**
 * 界面原子类 —— 全局唯一的样式片段定义。
 *
 * 「一定要统一」：列表页 / 编辑器 / 浮层的同类控件都从这里取类名，
 * 不再在各自文件里就地拼写，避免出现 48px 与 40px、描边与描边宽度不一致这类漂移。
 *
 * 铁律（OC Studio 界面语言）
 * - 极小圆角：3–8px（圆形头像/徽章除外）。语义名见下方 `ROUND_*`，值在 globals.css 的 @theme
 * - 控件零描边：输入框只有一条底线；线只用于区块之间 / 表格行 / 浮层边界 / 空态占位框
 * - 三级灰：ink / ink-muted / ink-faint
 * - 浮层菜单横向满宽：容器只留上下内边距，行自己带 px —— hover 左右不留缝（macOS 观感）
 */

/* ── 圆角（极小） ─────────────────────────────────────
   唯一源是 globals.css 的 @theme（`--radius-item/media/menu/panel`）。
   业务文件不要在就地写 `rounded-[6px]`，一律从这里取。 */
export const ROUND_ITEM = 'rounded-item'
export const ROUND_MEDIA = 'rounded-media'
export const ROUND_MENU = 'rounded-menu'
export const ROUND_PANEL = 'rounded-panel'

/* ── 字段行 ─────────────────────────────────────────────
   标签在左（固定 64px），内容在右，行间 1px 线（线画在行下方）。
   行容器加 `LIST_END` / `FIELD_GRID`，去掉**最后一行**的尾线 —— 那条线什么都不分隔，
   只会让每个区块看起来被一个方框围住。表格行（概览 / 回收站）同理。 */
export const FIELD_ROW = 'flex items-center gap-3 border-b border-line py-1.5'
export const FIELD_ROW_TOP = 'flex items-start gap-3 border-b border-line py-1.5'
/** 行容器：竖排（含全宽网格）—— 最后一行不要尾线 */
export const LIST_END = '[&>*:last-child]:border-b-0'
/** 字段行容器：两列网格 —— 最后**两格**都不要尾线（窄屏回落到 `LIST_END` 的效果） */
export const FIELD_GRID = '[&>*:last-child]:border-b-0 sm:[&>*:nth-last-child(-n+2)]:border-b-0'
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
export const PAGE_TITLE = 'text-lg text-ink font-serif font-bold tracking-[-0.01em]'

/* ── 图标按钮 ───────────────────────────────────────── */
export const ICON_BTN =
  `flex h-6 w-6 shrink-0 items-center justify-center text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink ${ROUND_ITEM}`

/* ── 按钮 ─────────────────────────────────────────────
   主按钮 = 浅底实心（**不是**实心墨色：强调色只留给「选中态」），次按钮 = 纯文字。
   原则：一屏之内不该出现第二块深色；动作靠位置与文字表达，不靠反相。 */
export const BTN_PRIMARY =
  `touch-feedback flex h-8 shrink-0 items-center gap-1.5 bg-paper-card px-3 text-[13px] text-ink transition-colors hover:bg-line disabled:opacity-40 ${ROUND_ITEM}`
export const BTN_QUIET =
  'flex h-8 shrink-0 items-center gap-1.5 px-1.5 text-[13px] text-ink-muted transition-colors hover:text-ink'

/* ── 输入 ─────────────────────────────────────────────
   零描边：静默态只留一条极淡的线，聚焦时加深。 */
export const INPUT_LINE =
  'w-full border-b border-line bg-transparent px-0 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-line-hover focus:outline-none'

/* ── 浮层 ─────────────────────────────────────────────
   只有浮层允许有边框；一律无阴影，靠半透明 + 模糊与内容分层。
   菜单容器**只有上下内边距**：左右不留白，行自带 px-3，hover 才能横向铺满。 */
export const PANEL = `border border-line bg-paper/85 backdrop-blur-lg shadow-none ${ROUND_PANEL}`
export const MENU = `border border-line bg-paper/85 backdrop-blur-lg py-1 shadow-none ${ROUND_MENU}`
/** 菜单行骨架：只含盒子与排版，不带文字色和 hover 底色（危险项 / 禁用项 / 高亮态用它） */
export const MENU_ITEM_BASE =
  `flex w-full items-center gap-2 px-3 py-1 text-left text-[13px] transition-colors ${ROUND_ITEM}`
export const MENU_ITEM = `${MENU_ITEM_BASE} text-ink hover:bg-[var(--oc-hover)]`
export const MENU_GROUP_LABEL = 'px-3 py-1 text-[11px] tracking-[0.08em] text-ink-faint'

/* ── chip ─────────────────────────────────────────────
   无描边、低对比底色；选中态反相为实心墨色。 */
export const CHIP = `inline-flex items-center gap-1 bg-paper-alt px-2 py-[3px] text-[12px] text-ink-muted ${ROUND_ITEM}`

/* ── 空态 / 加载 ─────────────────────────────────────── */
export const EMPTY_STATE = 'flex flex-1 flex-col items-center justify-center gap-2 py-24'
export const LOADING_TEXT = 'text-[13px] text-ink-faint'
