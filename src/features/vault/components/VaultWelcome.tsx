'use client'

import { Database, FolderOpen, FolderPlus } from 'lucide-react'

import { useVault } from '@/lib/vault/vault-provider'
import { BTN_PRIMARY, BTN_QUIET } from '@/lib/ui-tokens'
import { VaultOverlay } from './VaultOverlay'

/**
 * 首次引导。默认只在用户没做过选择时弹一次（见 provider 的 dismissed 记忆）。
 * 文案刻意讲清「文件是真源」，因为这是用户需要理解的核心契约。
 */
export function VaultWelcome() {
  const { welcomeOpen, dismissWelcome, openFolder, createFolder } = useVault()

  return (
    <VaultOverlay
      open={welcomeOpen}
      title="用文件夹管理你的设定集"
      description="一个文件夹就是一套设定集（和 Obsidian 的 vault 一样），词条存成 Markdown 文件。"
      onClose={dismissWelcome}
      footer={
        <button type="button" className={BTN_QUIET} onClick={dismissWelcome}>
          先不用，继续用内置数据库
        </button>
      }
    >
      <div className="flex flex-col gap-4 text-[13px] leading-relaxed text-ink-muted">
        <ul className="flex flex-col gap-2">
          <li className="flex gap-2">
            <span className="text-ink-faint">·</span>
            <span>
              <span className="text-ink">文件夹是真源。</span>
              关掉应用后数据就在文件夹里，拷走文件夹就是一套完整设定集。
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-ink-faint">·</span>
            <span>
              <span className="text-ink">能用 Obsidian 直接打开。</span>
              正文是 Markdown、属性是 frontmatter，<code className="text-ink-faint">[[文件名]]</code> 链接双向通用。
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-ink-faint">·</span>
            <span>
              <span className="text-ink">只改你动过的地方。</span>
              没编辑过的笔记一个字节都不会变。编辑某一篇时只写回那一篇：属性按它原有的键名更新，
              你手写的其它属性、目录结构都不动。
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-ink-faint">·</span>
            <span>
              <span className="text-ink">正文有一处会规范化。</span>
              被编辑的那一篇，块与块之间的空行数会统一成一行（Markdown 的块结构不记录空了几行）。
              其余排版权原样保留。
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-ink-faint">·</span>
            <span>
              <span className="text-ink">外部改动不会丢。</span>
              文件被 Obsidian 改过时，应用会拒绝覆盖并提示你，而不是静默冲掉。
            </span>
          </li>
        </ul>

        <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row">
          <button type="button" className={BTN_PRIMARY} onClick={() => void openFolder()}>
            <FolderOpen size={14} strokeWidth={2} />
            打开已有文件夹…
          </button>
          <button type="button" className={BTN_QUIET} onClick={() => void createFolder()}>
            <FolderPlus size={14} strokeWidth={2} />
            新建仓库…
          </button>
          <span className="flex items-center gap-1.5 text-[12px] text-ink-faint sm:ml-auto">
            <Database size={12} strokeWidth={2} />
            不选也能正常用
          </span>
        </div>
      </div>
    </VaultOverlay>
  )
}
