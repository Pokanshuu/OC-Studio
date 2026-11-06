/**
 * Project metadata shown in「关于」and referenced from the README.
 *
 * Kept in one place so a fork only has to change these three URLs.
 */

export const APP_NAME = 'Simple Agent'
export const APP_VERSION = '0.1.0'
export const APP_LICENSE = 'MIT'

/** This project. TODO: point at the real repository once it is published. */
export const REPO_URL = 'https://github.com/Pokanshuu/Simple-Agent'

/** Upstream: the Android app this is a desktop rewrite of. */
export const UPSTREAM_NAME = 'Simple Chat'
export const UPSTREAM_URL = 'https://github.com/Pokanshuu/Simple-Chat'

export interface OpenSourceEntry {
  name: string
  license: string
  url: string
  /** What it does here — one short clause, no marketing. */
  role: string
}

/** Everything shipped in the binary or bundled into the front end. */
export const OPEN_SOURCE: OpenSourceEntry[] = [
  { name: 'React', license: 'MIT', url: 'https://react.dev', role: 'UI' },
  { name: 'TypeScript', license: 'Apache-2.0', url: 'https://www.typescriptlang.org', role: '语言' },
  { name: 'Vite', license: 'MIT', url: 'https://vite.dev', role: '构建' },
  { name: 'Tauri', license: 'MIT OR Apache-2.0', url: 'https://tauri.app', role: '桌面壳 / IPC' },
  { name: 'Rust · tokio', license: 'MIT OR Apache-2.0', url: 'https://tokio.rs', role: '异步运行时' },
  { name: 'rusqlite · SQLite', license: 'MIT / Public Domain', url: 'https://sqlite.org', role: '本地存储' },
  { name: 'reqwest', license: 'MIT OR Apache-2.0', url: 'https://github.com/seanmonstar/reqwest', role: 'HTTP / SSE' },
  { name: 'keyring', license: 'MIT OR Apache-2.0', url: 'https://github.com/hwchen/keyring-rs', role: '系统凭据' },
  { name: 'react-markdown', license: 'MIT', url: 'https://github.com/remarkjs/react-markdown', role: 'Markdown 渲染' },
  { name: 'remark-gfm', license: 'MIT', url: 'https://github.com/remarkjs/remark-gfm', role: 'GFM 扩展' },
  { name: 'zustand', license: 'MIT', url: 'https://github.com/pmndrs/zustand', role: '状态管理' },
  { name: 'highlight.js', license: 'BSD-3-Clause', url: 'https://highlightjs.org', role: '语法高亮' },
  { name: 'lucide-react', license: 'ISC', url: 'https://lucide.dev', role: '图标' },
]
