/**
 * 「关于」页的开源致谢清单。
 *
 * 只列**直接依赖**（版本与许可证取自各自 package.json / Cargo.toml，2026-10 核对）；
 * 传递依赖不在这里逐条铺开 —— 完整依赖树见 `package.json` 与 `src-tauri/Cargo.toml`。
 *
 * 每一项都能点开仓库：走 `src/lib/open-external.ts` 交给系统浏览器，
 * 不在应用内开新窗口（Tauri 的 WebView 里 `target="_blank"` 是死的）。
 */

export interface CreditItem {
  name: string
  url: string
  /** SPDX 标识；双许可照写 */
  license: string
  /** 它在这个项目里干什么（可选，只写一句） */
  note?: string
}

export interface CreditGroup {
  title: string
  items: CreditItem[]
}

export const CREDIT_GROUPS: CreditGroup[] = [
  {
    title: '框架与运行时',
    items: [
      { name: 'Next.js', url: 'https://github.com/vercel/next.js', license: 'MIT', note: '应用框架' },
      { name: 'React', url: 'https://github.com/facebook/react', license: 'MIT', note: '界面层' },
      { name: 'Tauri', url: 'https://github.com/tauri-apps/tauri', license: 'MIT OR Apache-2.0', note: '桌面外壳' },
      { name: 'Capacitor', url: 'https://github.com/ionic-team/capacitor', license: 'MIT', note: '移动端外壳' },
    ],
  },
  {
    title: '编辑器与文档',
    items: [
      { name: 'Tiptap', url: 'https://github.com/ueberdosis/tiptap', license: 'MIT', note: '富文本内核（构建在 ProseMirror 之上）' },
      { name: 'markdown-it', url: 'https://github.com/markdown-it/markdown-it', license: 'MIT', note: 'Markdown 解析' },
      { name: 'js-yaml', url: 'https://github.com/nodeca/js-yaml', license: 'MIT', note: 'frontmatter 解析' },
      { name: 'heic-to', url: 'https://github.com/hoppergee/heic-to', license: 'LGPL-3.0', note: 'HEIC / HEIF 转换' },
    ],
  },
  {
    title: '数据与状态',
    items: [
      { name: 'Dexie.js', url: 'https://github.com/dexie/Dexie.js', license: 'Apache-2.0', note: 'IndexedDB 封装' },
      { name: 'TanStack Query', url: 'https://github.com/TanStack/query', license: 'MIT', note: '异步数据缓存' },
    ],
  },
  {
    title: '界面与交互',
    items: [
      { name: 'Tailwind CSS', url: 'https://github.com/tailwindlabs/tailwindcss', license: 'MIT' },
      { name: 'Base UI', url: 'https://github.com/mui/base-ui', license: 'MIT', note: '菜单 / 弹窗原语' },
      { name: 'Radix UI', url: 'https://github.com/radix-ui/primitives', license: 'MIT' },
      { name: 'shadcn/ui', url: 'https://github.com/shadcn-ui/ui', license: 'MIT', note: '组件形制' },
      { name: 'lucide', url: 'https://github.com/lucide-icons/lucide', license: 'ISC', note: '图标' },
      { name: 'React Flow', url: 'https://github.com/xyflow/xyflow', license: 'MIT', note: '关系图' },
      { name: 'dnd-kit', url: 'https://github.com/clauderic/dnd-kit', license: 'MIT', note: '拖拽排序' },
      { name: 'cmdk', url: 'https://github.com/pacocoursey/cmdk', license: 'MIT', note: '命令面板' },
      { name: 'sonner', url: 'https://github.com/emilkowalski/sonner', license: 'MIT', note: '通知' },
      { name: 'react-easy-crop', url: 'https://github.com/ValentinH/react-easy-crop', license: 'MIT', note: '图片裁剪' },
      { name: 'react-image-crop', url: 'https://github.com/dominictobias/react-image-crop', license: 'ISC' },
      { name: 'clsx', url: 'https://github.com/lukeed/clsx', license: 'MIT' },
      { name: 'tailwind-merge', url: 'https://github.com/dcastil/tailwind-merge', license: 'MIT' },
      { name: 'tw-animate-css', url: 'https://github.com/Wombosvideo/tw-animate-css', license: 'MIT' },
    ],
  },
  {
    title: '桌面与移动',
    items: [
      { name: 'Tauri Plugins', url: 'https://github.com/tauri-apps/plugins-workspace', license: 'MIT OR Apache-2.0', note: 'dialog · fs · clipboard · log' },
      { name: 'Capacitor Plugins', url: 'https://github.com/ionic-team/capacitor-plugins', license: 'MIT', note: 'app · clipboard · filesystem · haptics · keyboard' },
      { name: 'window-vibrancy', url: 'https://github.com/tauri-apps/window-vibrancy', license: 'Apache-2.0 OR MIT', note: 'Windows Mica / 背景模糊' },
    ],
  },
  {
    title: '构建与工具',
    items: [
      { name: 'TypeScript', url: 'https://github.com/microsoft/TypeScript', license: 'Apache-2.0' },
      { name: 'ESLint', url: 'https://github.com/eslint/eslint', license: 'MIT' },
      { name: 'tsx', url: 'https://github.com/privatenumber/tsx', license: 'MIT', note: 'Node 里跑 TypeScript 脚本' },
    ],
  },
]
