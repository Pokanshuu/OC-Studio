'use client'

import { CloudUpload, FolderInput, FolderOpen, FolderPlus, ImageDown, RefreshCw, Unplug } from 'lucide-react'

import { useVault } from '@/lib/vault/vault-provider'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * 桌面菜单栏「文件」顶部的 Vault 分组。
 * 支持 vault 的环境才渲染；浏览器版完全看不到，避免给出点不动的入口。
 */
export function VaultMenuSection() {
  const vault = useVault()
  if (!vault.supported) return null

  const ready = vault.status === 'ready'
  const busy = vault.status === 'loading' || vault.status === 'booting'

  return (
    <>
      <DropdownMenuItem disabled className="text-ink-faint">
        {ready ? `当前仓库：${vault.name ?? ''}` : busy ? '正在载入仓库…' : '未使用仓库'}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => void vault.openFolder()}>
        <FolderInput size={14} strokeWidth={2} />
        打开仓库文件夹…
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => void vault.createFolder()}>
        <FolderPlus size={14} strokeWidth={2} />
        新建仓库…
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
        重新扫描磁盘
      </DropdownMenuItem>
      <DropdownMenuItem disabled={!ready} onClick={vault.showReport}>
        <FolderOpen size={14} strokeWidth={2} />
        扫描报告…
      </DropdownMenuItem>
      <DropdownMenuItem disabled={!ready} onClick={() => void vault.migrateImages()}>
        <ImageDown size={14} strokeWidth={2} />
        把内置图片迁入仓库
      </DropdownMenuItem>
      <DropdownMenuItem disabled={!ready} onClick={() => void vault.flush()}>
        <CloudUpload size={14} strokeWidth={2} />
        立即写盘
      </DropdownMenuItem>
      <DropdownMenuItem disabled={!ready} onClick={() => void vault.close()}>
        <Unplug size={14} strokeWidth={2} />
        关闭仓库
      </DropdownMenuItem>
      <DropdownMenuSeparator />
    </>
  )
}
