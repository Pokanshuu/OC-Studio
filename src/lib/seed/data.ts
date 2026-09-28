/**
 * 示例数据的**素材层**：内联 SVG 资源生成器 + 各实体的示例图片/文本常量。
 *
 * 与播种逻辑分家的原因：这里是纯数据（可预览、可整体替换），原先与 399 行的播种组件
 * 挤在同一文件里 —— 改一条示例数据要先翻过整个组件。
 */
function svgUrl(svg: string): string {
  return 'data:image/svg+xml,' + encodeURIComponent(svg.trim())
}

// ============================================================
// 示例文本
// ============================================================
export const SAMPLE_TEXT_INTRO = '这是一段示例文本'
export const SAMPLE_TEXT_P1 = '小车正穿行在落基山脉蜿蜒曲折的盘山公路上,克利斯朵夫·李维静静地望着窗外,发现每当车子即将行驶到无路的当口,路边都会出现一块交通指示牌:"前方转弯!"或"注意!急转弯",而拐过每一道弯之后,前方照例又是一片柳暗花明,豁然开朗。'
export const SAMPLE_TEXT_P2 = '山路弯弯,峰回路转。前方转弯几个大字一次次地冲击着他的眼球,也渐渐扣开了他的心扉,原来不是路已到了尽头,而是该转弯了。'
export const SAMPLE_TEXT_P3 = '路在脚下,更在心中;心随路转,心路常宽。学会转弯也是人生的智慧,因为挫折往往是转折,危机同时是转机。'

export const SAMPLE_HTML = `<blockquote><p><em>${SAMPLE_TEXT_INTRO}</em></p></blockquote><p>${SAMPLE_TEXT_P1}</p><p>${SAMPLE_TEXT_P2}</p><p>${SAMPLE_TEXT_P3}</p>`

// ============================================================
// SVG 生成辅助函数
// ============================================================
function makeAvatar(color: string): string {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="100" fill="${color}"/><circle cx="100" cy="76" r="30" fill="white" opacity="0.9"/><ellipse cx="100" cy="152" rx="50" ry="38" fill="white" opacity="0.9"/></svg>`)
}

function makePortrait(color: string): string {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="240"><rect width="120" height="240" rx="6" fill="#F5F2ED"/><circle cx="60" cy="48" r="22" fill="${color}"/><path d="M36 78L84 78L90 148L30 148Z" fill="${color}"/><line x1="38" y1="148" x2="26" y2="210" stroke="${color}" stroke-width="5" stroke-linecap="round"/><line x1="82" y1="148" x2="94" y2="210" stroke="${color}" stroke-width="5" stroke-linecap="round"/></svg>`)
}

function makeHeader(color1: string, color2: string): string {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${color1}"/><stop offset="100%" stop-color="${color2}"/></linearGradient></defs><rect width="800" height="300" fill="url(#g)"/></svg>`)
}

function makeGalleryImage(color1: string, color2: string, angle: string): string {
  const x1 = angle === 'v' ? '0%' : '0%'
  const y1 = angle === 'h' ? '0%' : '0%'
  const x2 = angle === 'v' ? '0%' : '100%'
  const y2 = angle === 'h' ? '100%' : '100%'
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0%" stop-color="${color1}"/><stop offset="100%" stop-color="${color2}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/></svg>`)
}

function makeFlag(color: string): string {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect x="12" y="24" width="96" height="72" rx="8" fill="#F5F2ED"/><polygon points="60,38 98,82 22,82" fill="${color}"/></svg>`)
}

// ============================================================
// 角色 A — 暖橙珊瑚色系 #E8744B
// ============================================================
export const COLOR_A = '#E8744B'

export const CHAR_A_AVATAR = makeAvatar(COLOR_A)
export const CHAR_A_PORTRAIT1 = makePortrait(COLOR_A)
export const CHAR_A_PORTRAIT2 = makePortrait('#C0603A')
export const CHAR_A_HEADER = makeHeader(COLOR_A, '#F0A880')
export const CHAR_A_GALLERY = [
  { url: makeGalleryImage(COLOR_A, '#F0C8A0', 'd'), caption: '' },
  { url: makeGalleryImage('#F0A880', COLOR_A, 'h'), caption: '' },
  { url: makeGalleryImage('#FFD4B8', COLOR_A, 'v'), caption: '' },
  { url: makeGalleryImage(COLOR_A, '#FFE0CC', 'd'), caption: '' },
]

// ============================================================
// 角色 B — 蓝紫色系 #6C5CE7
// ============================================================
export const COLOR_B = '#6C5CE7'

export const CHAR_B_AVATAR = makeAvatar(COLOR_B)
export const CHAR_B_PORTRAIT1 = makePortrait(COLOR_B)
export const CHAR_B_PORTRAIT2 = makePortrait('#5849C2')
export const CHAR_B_HEADER = makeHeader(COLOR_B, '#A29BFE')
export const CHAR_B_GALLERY = [
  { url: makeGalleryImage(COLOR_B, '#A29BFE', 'd'), caption: '' },
  { url: makeGalleryImage('#8175E0', COLOR_B, 'h'), caption: '' },
  { url: makeGalleryImage('#C8C0FF', COLOR_B, 'v'), caption: '' },
  { url: makeGalleryImage(COLOR_B, '#DFDAFF', 'd'), caption: '' },
]

// ============================================================
// 角色 C — 翠绿色系 #00B894
// ============================================================
export const COLOR_C = '#00B894'

export const CHAR_C_AVATAR = makeAvatar(COLOR_C)
export const CHAR_C_PORTRAIT1 = makePortrait(COLOR_C)
export const CHAR_C_PORTRAIT2 = makePortrait('#00A381')
export const CHAR_C_HEADER = makeHeader(COLOR_C, '#55EFC4')
export const CHAR_C_GALLERY = [
  { url: makeGalleryImage(COLOR_C, '#55EFC4', 'd'), caption: '' },
  { url: makeGalleryImage('#00D2A0', COLOR_C, 'h'), caption: '' },
  { url: makeGalleryImage('#88FFD8', COLOR_C, 'v'), caption: '' },
  { url: makeGalleryImage(COLOR_C, '#BBFFEC', 'd'), caption: '' },
]

// ============================================================
// 国家图片
// ============================================================
// 晨曦共和国 — 暖黄色系
export const COUNTRY1_FLAG = makeFlag('#E8A830')
export const COUNTRY1_HEADER = makeHeader('#F0C860', '#E8A830')

// 暮光联邦 — 深蓝紫系
export const COUNTRY2_FLAG = makeFlag('#4A5BC6')
export const COUNTRY2_HEADER = makeHeader('#3D3680', '#5B6ED4')

// ============================================================
// 事件图片
// ============================================================
export const EVENT1_HEADER = makeHeader('#E8744B', '#6C5CE7')
export const EVENT1_IMAGE1 = makeGalleryImage('#E8744B', '#D4A574', 'd')
export const EVENT1_IMAGE2 = makeGalleryImage('#6C5CE7', '#E8744B', 'h')

export const EVENT2_HEADER = makeHeader('#6C5CE7', '#00B894')
export const EVENT2_IMAGE1 = makeGalleryImage('#6C5CE7', '#A29BFE', 'd')
export const EVENT2_IMAGE2 = makeGalleryImage('#00B894', '#6C5CE7', 'h')

