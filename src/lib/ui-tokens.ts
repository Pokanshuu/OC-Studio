/**
 * 界面原子类 —— 全局唯一的样式片段定义。
 *
 * 「一定要统一」：列表页 / 编辑器 / 浮层的同类控件都从这里取类名，
 * 不再在各自文件里就地拼写，避免出现 48px 与 40px、描边与描边宽度不一致这类漂移。
 *
 * 铁律（OC Studio 界面语言）
 * - 极小圆角：只有三档 4 / 6 / 8（圆形头像/徽章/色点除外）。语义名见下方 `ROUND_*`，值在 globals.css 的 @theme
 * - 控件零描边：输入框只有一条底线；线只用于区块之间 / 表格行 / 浮层边界 / 空态占位框
 * - 三级灰：ink / ink-muted / ink-faint
 * - 浮层菜单横向满宽：容器只留上下内边距，行自己带 px —— hover 左右不留缝（macOS 观感）
 */

/* ── 圆角（三档） ─────────────────────────────────────
   唯一源是 globals.css 的 @theme。只有三档，按「元素在界面里的角色」选，不按喜好：
     小 ROUND_ITEM     4px  贴内容的小件：chip / 菜单行 / 复选 / 缩略图 / 图片 / 卡片
     中 ROUND_CONTROL  6px  一个能点的控件：按钮 / 图标按钮 / 菜单与浮层容器
     大 ROUND_PANEL    8px  一块浮起来的容器：弹窗 / 面板 / 底部抽屉
   圆形（头像/徽章/色点/开关/浮在图上的圆钮）直接写 `rounded-full`；贴边整条写 `rounded-none`。
   业务文件不要就地写 `rounded-[6px]`，也不要用 `rounded-sm|md|lg`。 */
export const ROUND_ITEM = 'rounded-item'
export const ROUND_CONTROL = 'rounded-control'
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

/** 列表页 / 时间线 / 相册的页头（桌面 48px，粘顶） */
export const TOOLBAR =
  'max-md:hidden flex items-center justify-between sticky top-0 z-10 h-12 border-b border-line px-6 bg-paper/85 backdrop-blur-lg'

/** 编辑器页头：桌面粘顶 48px，移动端固定在安全区之下 */
export const EDITOR_HEADER =
  'flex items-center justify-between max-md:fixed max-md:top-0 max-md:left-0 max-md:right-0 md:sticky md:top-0 z-10 border-b border-line px-4 max-md:h-[calc(60px+var(--safe-top))] md:h-12 max-md:pt-[var(--safe-top)] bg-paper/85 backdrop-blur-lg'

/** 编辑器正文容器：移动端给固定页头让位 */
export const EDITOR_BODY = 'flex-1 min-h-0 max-md:pt-[calc(60px+var(--safe-top))]'

/** 实体名输入（18px 衬线，与 PAGE_TITLE 同档） */
export const TITLE_INPUT =
  'w-full bg-transparent font-serif text-lg text-ink placeholder:text-ink-faint focus:outline-none'

/** 字段行里的行内输入（零描边，占满剩余宽度） */
export const FIELD_INPUT =
  'min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none'

/** 年 / 月 / 日 三段输入（整组共用一条底线；事件时间与角色生日共用） */
export const DATE_INPUT =
  'h-6 w-14 min-w-0 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none'

/** 居中兜底态：空态 / 加载 / 错误（竖排、居中、gap-3） */
export const CENTER_STATE = 'flex h-full flex-col items-center justify-center gap-3'

/* ── 图标按钮 ───────────────────────────────────────── */
export const ICON_BTN =
  `flex h-6 w-6 shrink-0 items-center justify-center text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink ${ROUND_CONTROL}`
/** 页头 / 工具栏里的大图标按钮（32px）：返回、刷新、侧栏开关 */
export const ICON_BTN_MD =
  `flex h-8 w-8 shrink-0 items-center justify-center text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink ${ROUND_CONTROL}`

/* ── 按钮 ─────────────────────────────────────────────
   主按钮 = 浅底实心（**不是**实心墨色：强调色只留给「选中态」），次按钮 = 纯文字。
   原则：一屏之内不该出现第二块深色；动作靠位置与文字表达，不靠反相。 */
export const BTN_PRIMARY =
  `touch-feedback flex h-8 shrink-0 items-center gap-1.5 bg-paper-card px-3 text-[13px] text-ink transition-colors hover:bg-line disabled:opacity-40 ${ROUND_CONTROL}`
export const BTN_QUIET =
  'flex h-8 shrink-0 items-center gap-1.5 px-1.5 text-[13px] text-ink-muted transition-colors hover:text-ink'

/**
 * 危险按钮 —— **全局唯一形态**：灰调实心红（`--oc-danger`）。
 *
 * 只给「点下去数据就没了」的确认动作：删除 / 永久删除 / 放弃未保存改动 / 清空并导入。
 * 其余确认一律 `BTN_PRIMARY`（浅底实心），取消一律 `BTN_QUIET`，不要自编红底或描边红。
 * 菜单行里的危险项**不套这个**：行只换文字色（`MENU_ITEM_BASE` + `text-error`，
 * hover `bg-error-light`）—— 在菜单里铺一块红底会把「行」变成「按钮」。
 */
export const BTN_DANGER =
  `touch-feedback flex h-8 shrink-0 items-center justify-center gap-1.5 bg-danger px-3 text-[13px] text-danger-ink transition-colors hover:bg-danger-hover focus-visible:outline-none disabled:opacity-40 ${ROUND_CONTROL}`

/* ── 输入 ─────────────────────────────────────────────
   零描边：静默态只留一条极淡的线，聚焦时加深。 */
export const INPUT_LINE =
  'w-full border-b border-line bg-transparent px-0 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-line-hover focus:outline-none'

/* ── 浮层 ─────────────────────────────────────────────
   只有浮层允许有边框；**阴影只有一档**（`FLOAT_SHADOW`，值在 globals.css 的 `--oc-shadow-float`）——
   小、淡、两层，只用来把浮层从内容上「抬起来」；卡片 / 按钮 / 输入仍然是零阴影。
   菜单容器**只有上下内边距**：左右不留白，行自带 px-3，hover 才能横向铺满。 */
export const FLOAT_SHADOW = 'float-shadow'
export const PANEL = `border border-line bg-paper/85 backdrop-blur-lg ${FLOAT_SHADOW} ${ROUND_PANEL}`
export const MENU = `border border-line bg-paper/85 backdrop-blur-lg py-1 ${FLOAT_SHADOW} ${ROUND_CONTROL}`
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

/* ── 列表页（网格 / 搜索） ─────────────────────────────
   列表页的列数只在这一处定义：角色 / 事件 / 国家三张列表共用。 */
export const LIST_GRID = 'grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
/** 列表页页头里的搜索框（左侧给搜索图标留 pl-8） */
export const SEARCH_INPUT =
  'h-8 w-44 border-b border-transparent bg-transparent pl-8 pr-2 text-[13px] text-ink placeholder:text-ink-faint transition-colors focus:border-line-hover focus:outline-none'
/** 搜索图标：绝对定位在输入框左侧 */
export const SEARCH_ICON = 'pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint'

/* ── 素材卡片（列表卡片 / 画廊格子的图区） ───────────── */
/** 图区外框：固定比例 + 卡片底色（图加载前就是这块底色） */
export const MEDIA_CARD = 'relative aspect-[3/2] w-full bg-paper-card'
/** 图片本身的填充方式 */
export const MEDIA_IMG = 'absolute inset-0 h-full w-full object-cover'
/** 图底部的渐变过渡：避免图片与卡片底色之间出现硬边 */
export const MEDIA_GRADIENT =
  'pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-paper-card to-transparent'
/** 无图占位：衬线首字，不用图形图标 */
export const MEDIA_FALLBACK = 'absolute inset-0 grid place-items-center font-serif text-2xl text-ink-faint'

/* ── 列表行 / 移动端筛选条 ───────────────────────────── */
/** 列表行右侧的动作组（悬停才出现，纵向居中） */
export const ROW_ACTIONS = 'absolute right-2 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100'
/** 空态里那句「点这里去建一个」的衬线提示 */
export const EMPTY_HINT = 'font-serif text-sm text-ink-faint transition-colors hover:text-ink'
/** 移动端筛选条右侧的新建按钮 */
export const MOBILE_FILTER_BTN =
  'touch-feedback flex items-center gap-1 bg-paper/85 px-2 py-1 text-[11px] text-ink-muted backdrop-blur transition-colors hover:text-ink'

/** 筛选 / 排序下拉的触发按钮（桌面 h-8，移动端 h-7；宽度由内容决定） */
export const FILTER_TRIGGER =
  'touch-feedback flex h-7 items-center gap-1 px-2 text-[11px] text-ink transition-colors hover:bg-[var(--oc-hover)] md:h-8 md:px-3 md:text-[13px]'

/* ── 拖拽排序 ─────────────────────────────────────────
   手柄位置只有两种：卡片压在图左上角、列表行在左侧留白里。
   位置定在这里，卡片 / 行只管渲染 DragHandle。 */
export const DRAG_SLOT_CARD = 'absolute left-2 top-2 z-10'
export const DRAG_SLOT_ROW = 'absolute left-2 top-1/2 -translate-y-1/2'

/* ── 关系图节点 ──────────────────────────────────────── */
/** 节点外壳：图标在上、名字在下的竖排 */
export const NODE_WRAPPER = 'flex flex-col items-center gap-1 group cursor-pointer'
