'use client'

import { BTN_DANGER, BTN_QUIET } from '@/lib/ui-tokens'
import { useVault } from '@/lib/vault/vault-provider'
import { VaultOverlay } from './VaultOverlay'

/**
 * 「采用磁盘版本」的显式确认。
 *
 * 只有用户在这里点「采用磁盘版本」才会 `discardConflict`；取消 / Esc / 点背景都保持两边不变。
 * 不提供「先写本地再读盘」的组合 —— 采用磁盘就是放弃本地冲突，不能反过来覆盖外部文件。
 */
export function VaultConflictDialog() {
  const { conflictChoice, answerConflictChoice } = useVault()
  const paths = conflictChoice?.paths ?? []

  return (
    <VaultOverlay
      open={conflictChoice !== null}
      title="采用磁盘版本？"
      onClose={() => answerConflictChoice(false)}
      widthClass="max-w-md"
      footer={
        <>
          <button type="button" className={BTN_QUIET} onClick={() => answerConflictChoice(false)}>
            取消
          </button>
          <button type="button" className={BTN_DANGER} onClick={() => answerConflictChoice(true)}>
            采用磁盘版本
          </button>
        </>
      }
    >
      <p className="text-[13px] text-ink-muted">
        采用后会放弃这些文件尚未写入的本地修改。磁盘上的文件不会被改写。
      </p>
      {paths.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {paths.slice(0, 8).map((path) => (
            <li key={path} className="truncate text-[12px] text-ink">
              {path}
            </li>
          ))}
          {paths.length > 8 ? (
            <li className="text-[12px] text-ink-faint">还有 {paths.length - 8} 个文件</li>
          ) : null}
        </ul>
      ) : null}
    </VaultOverlay>
  )
}
