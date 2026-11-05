/**
 * Icons — single source: `lucide-react`, `strokeWidth={2}`, 16px on desktop.
 *
 * The name map keeps the call sites readable (`<Icon name="send" />`) while the
 * actual glyphs come from the library, so a new icon is one line here instead of
 * a hand-drawn path.
 */

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Copy,
  Download,
  FileText,
  Folder,
  GitBranch,
  Globe,
  Image as ImageIcon,
  Info,
  KeyRound,
  Layers,
  List,
  Loader2,
  MoreHorizontal,
  PanelLeft,
  Paperclip,
  Pencil,
  Pin,
  Plus,
  RotateCw,
  Search,
  Settings,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Upload,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { CSSProperties } from 'react'

export type IconName =
  | 'plus'
  | 'search'
  | 'settings'
  | 'send'
  | 'stop'
  | 'copy'
  | 'check'
  | 'refresh'
  | 'edit'
  | 'trash'
  | 'chevron-down'
  | 'chevron-up'
  | 'chevron-left'
  | 'chevron-right'
  | 'sidebar'
  | 'pin'
  | 'image'
  | 'paperclip'
  | 'file'
  | 'close'
  | 'sparkles'
  | 'brain'
  | 'wrench'
  | 'folder'
  | 'terminal'
  | 'globe'
  | 'list'
  | 'arrow-down'
  | 'more'
  | 'branch'
  | 'download'
  | 'upload'
  | 'key'
  | 'info'
  | 'alert'
  | 'check-circle'
  | 'circle'
  | 'loader'
  | 'layers'
  | 'zap'

const GLYPHS: Record<IconName, LucideIcon> = {
  plus: Plus,
  search: Search,
  settings: Settings,
  send: ArrowUp,
  stop: Square,
  copy: Copy,
  check: Check,
  refresh: RotateCw,
  edit: Pencil,
  trash: Trash2,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  sidebar: PanelLeft,
  pin: Pin,
  image: ImageIcon,
  paperclip: Paperclip,
  file: FileText,
  close: X,
  sparkles: Sparkles,
  brain: Brain,
  wrench: Wrench,
  folder: Folder,
  terminal: Terminal,
  globe: Globe,
  list: List,
  'arrow-down': ArrowDown,
  more: MoreHorizontal,
  branch: GitBranch,
  download: Download,
  upload: Upload,
  key: KeyRound,
  info: Info,
  alert: AlertTriangle,
  'check-circle': CheckCircle2,
  circle: Circle,
  loader: Loader2,
  layers: Layers,
  zap: Zap,
}

export interface IconProps {
  name: IconName
  size?: number
  className?: string
  style?: CSSProperties
}

export function Icon({ name, size = 16, className, style }: IconProps) {
  const Glyph = GLYPHS[name]
  return (
    <Glyph
      className={['icon', name === 'loader' ? 'icon-spin' : '', className]
        .filter(Boolean)
        .join(' ')}
      size={size}
      strokeWidth={2}
      style={style}
      aria-hidden="true"
      focusable="false"
    />
  )
}
