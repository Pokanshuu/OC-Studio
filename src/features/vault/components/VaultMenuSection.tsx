'use client'

import { FolderInput, FolderOpen, FolderPlus, RefreshCw } from 'lucide-react'

import { useVault } from '@/lib/vault/vault-provider'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * 桌面菜单栏「文件」顶部的本地文件夹分组。
 *
 * 只有几件事：换一个文件夹、看看文件夹里发生了什么。
 * 「关闭文件夹」「立即写盘」「把旧图片收进文件夹」都已经删掉 ——
 * 没有第二套数据源，退出应用就是关闭；保存是防抖自动的，状态在状态栏看；
 * 图片由落地迁移一起搬进来（字段 + 正文 + data URI 全覆盖），
 * 单独留一个只认字段的半套动作只会搬一半。
 *
 * 「导入旧版本数据」只留在启动闸门：这里的菜单只有在已经绑定笔记库后才会出现，
 * 那时 Dexie 里装的就是这个库本身，再叫「旧版本数据」只会让人以为还有一份没搬的东西。
 */
export function VaultMenuSection() {
  const vault = useVault()
  if (!vault.supported) return null

  const ready = vault.status === 'ready'
  const busy = vault.status === 'loading' || vault.status === 'booting'

  return (
    <>
      <DropdownMenuItem disabled className="text-ink-faint">
        {ready ? `当前笔记库：${vault.name ?? ''}` : busy ? '正在载入文件夹…' : '还没有选择文件夹'}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => void vault.openFolder()}>
        <FolderInput size={14} strokeWidth={2} />
        打开本地文件夹…
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => void vault.createFolder()}>
        <FolderPlus size={14} strokeWidth={2} />
        新建本地文件夹…
      </DropdownMenuItem>
      {vault.recent.length > 0 ? (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>最近打开</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {vault.recent.map((entry) => (
              <DropdownMenuItem
                key={entry.path}
                onClick={() => void vault.openFolder(entry.path)}
                title={entry.path}
              >
                {entry.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={!ready} onClick={() => void vault.rescan()}>
        <RefreshCw size={14} strokeWidth={2} />
        刷新
      </DropdownMenuItem>
      <DropdownMenuItem disabled={!ready} onClick={vault.showReport}>
        <FolderOpen size={14} strokeWidth={2} />
        概览…
      </DropdownMenuItem>

      <DropdownMenuSeparator />
    </>
  )
}
