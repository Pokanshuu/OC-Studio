'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import type { MergeStrategy } from '@/lib/import'
import { useVault } from '@/lib/vault/vault-provider'
import { vaultFs } from '@/lib/vault/vault-fs'
import { MergeStrategyPicker } from '@/components/shared/merge-strategy'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { BTN_DANGER, BTN_PRIMARY } from '@/lib/ui-tokens'

/**
 * 「导入旧版本数据」的唯一实现。
 *
 * 两个入口共用：启动闸门（还没打开笔记库）与文件菜单（已经进了主界面）。
 * 流程是「选文件夹 → 里面已有笔记就先问同名策略 → 再写」，写盘与开库交给 provider。
 *
 * 为什么对话框由调用方渲染：下拉菜单关闭时 `DropdownMenuContent` 会整棵卸载，
 * 把对话框挂在下拉里会在点击的瞬间一起消失。
 */
export function useLegacyImport() {
  const { pickFolder, migrateLegacy } = useVault()
  const [migrating, setMigrating] = useState(false)
  /** 文件夹里已有笔记时，先问策略再写（不给默认值） */
  const [pendingFolder, setPendingFolder] = useState<string | null>(null)
  const [strategy, setStrategy] = useState<MergeStrategy>('skip')

  const runMigration = useCallback(
    async (path: string, chosen?: MergeStrategy) => {
      setMigrating(true)
      try {
        await migrateLegacy({ path, strategy: chosen })
      } finally {
        setMigrating(false)
      }
    },
    [migrateLegacy],
  )

  /** 主按钮：选文件夹 → 里面已有笔记就先问策略 → 再写 */
  const start = useCallback(async () => {
    const target = await pickFolder()
    if (target === null) return

    let hasNotes = false
    try {
      const existing = await vaultFs.scan(target)
      hasNotes = existing.files.some(
        (file) => /\.md$/i.test(file.relPath) && !file.relPath.startsWith('.ocstudio/'),
      )
    } catch (err) {
      toast.error('读不到这个文件夹', {
        description: err instanceof Error ? err.message : String(err),
      })
      return
    }

    if (!hasNotes) {
      await runMigration(target)
      return
    }
    setStrategy('skip')
    setPendingFolder(target)
  }, [pickFolder, runMigration])

  const dialog = (
    <AlertDialog
      open={pendingFolder !== null}
      onOpenChange={(open) => {
        if (!open) setPendingFolder(null)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>合并到已有笔记</AlertDialogTitle>
          <AlertDialogDescription>这个文件夹里已经有笔记</AlertDialogDescription>
        </AlertDialogHeader>

        <MergeStrategyPicker value={strategy} onChange={setStrategy} label="同名笔记怎么处理" />

        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <button
            type="button"
            className={strategy === 'replace' ? BTN_DANGER : BTN_PRIMARY}
            onClick={() => {
              const target = pendingFolder
              setPendingFolder(null)
              if (target !== null) void runMigration(target, strategy)
            }}
          >
            开始写入
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { start, dialog, migrating }
}
