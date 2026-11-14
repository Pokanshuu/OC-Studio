import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { VaultFlushReport } from '@/lib/vault/vault-persist'
import type { ConflictConfirmationRequest } from '@/lib/vault/conflict-confirmation'

/**
 * 第二轮 CODEX Q08 的正式回归：
 * 恢复「采用磁盘版本」出口，同时保证普通刷新仍走保存屏障、取消两边不动、
 * 确认不先覆盖外部文件、结果能回到调用方。
 */

const h = vi.hoisted(() => ({
  discard: vi.fn(),
  drain: vi.fn(),
  status: { pending: 0, flushing: false },
}))

vi.mock('@/lib/vault/vault-persist', () => ({
  discardConflict: h.discard,
  drainVaultWrites: h.drain,
  currentStatus: () => ({
    pending: h.status.pending,
    flushing: h.status.flushing,
    lastError: null,
    lastFlushedAt: null,
  }),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}))

import { toast } from 'sonner'
import { adoptDiskAndReload, describeReloadBlock, reloadAfterSaveBarrier } from '@/lib/vault/vault-reload'
import { createConflictConfirmation } from '@/lib/vault/conflict-confirmation'
import { reportSaveBarrierFailures } from '@/lib/save-feedback'
import type { SaveBarrierFailure } from '@/lib/save-barrier'

function emptyReport(patch: Partial<VaultFlushReport> = {}): VaultFlushReport {
  return {
    written: 0,
    movedToTrash: 0,
    restored: 0,
    removed: 0,
    conflicts: [],
    errors: [],
    ...patch,
  }
}

beforeEach(() => {
  h.discard.mockReset()
  h.drain.mockReset()
  h.drain.mockResolvedValue(emptyReport())
  h.status.pending = 0
  h.status.flushing = false
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.info).mockClear()
})

describe('普通刷新仍走保存屏障，并把结果返回调用方', () => {
  test('屏障失败返回 blocked、不重载，调用方不能当成功', async () => {
    const failures: SaveBarrierFailure[] = [
      { stage: 'conflict', relPath: '世界观/甲.md', message: '磁盘版本更新' },
    ]
    const onBlocked = vi.fn()
    const reload = vi.fn(async () => '新数据')

    const result = await reloadAfterSaveBarrier({
      barrier: async () => failures,
      reload,
      onBlocked,
    })

    expect(result).toEqual({ status: 'blocked', failures })
    expect(onBlocked).toHaveBeenCalledWith(failures)
    expect(reload).not.toHaveBeenCalled()
  })

  test('屏障全绿才重载并返回数据', async () => {
    const result = await reloadAfterSaveBarrier({
      barrier: async () => [],
      reload: async () => 42,
      onBlocked: vi.fn(),
    })
    expect(result).toEqual({ status: 'reloaded', value: 42 })
  })

  test('读盘失败返回 failed（不是 resolve 成成功）', async () => {
    const result = await reloadAfterSaveBarrier({
      barrier: async () => [],
      reload: async () => {
        throw new Error('读盘失败')
      },
      onBlocked: vi.fn(),
    })
    expect(result).toEqual({ status: 'failed', error: '读盘失败' })
  })
})

describe('明确采用磁盘版本', () => {
  test('确认后：丢弃每条本地冲突 → 排干其它写入 → 读盘；绝不先覆盖磁盘', async () => {
    const order: string[] = []
    h.discard.mockImplementation((relPath: string) => {
      order.push(`discard:${relPath}`)
    })
    h.drain.mockImplementation(async () => {
      order.push('drain')
      return emptyReport()
    })
    const reload = vi.fn(async () => {
      order.push('reload')
    })

    const result = await adoptDiskAndReload(
      ['世界观/甲.md', '世界观/甲.md', '世界观/乙.md'],
      {
        discard: (relPath) => h.discard(relPath),
        drain: () => h.drain(),
        status: () => h.status,
        reload,
      },
    )

    expect(result).toEqual({ status: 'reloaded' })
    expect(order).toEqual([
      'discard:世界观/甲.md',
      'discard:世界观/乙.md',
      'drain',
      'reload',
    ])
    // 采用磁盘只允许“放弃本地 + 读盘”，不能先写回外部文件
    expect(h.drain).toHaveBeenCalledTimes(1)
    expect(h.drain.mock.calls[0]).toEqual([])
    expect(h.drain).not.toHaveBeenCalledWith(
      expect.objectContaining({ overwriteConflicts: true }),
    )
  })

  test('丢弃后仍有其它冲突或写失败：返回 blocked，不读盘', async () => {
    h.drain.mockResolvedValue(
      emptyReport({
        conflicts: ['世界观/丙.md'],
        errors: [{ relPath: '世界观/丁.md', message: '磁盘已满' }],
      }),
    )
    const reload = vi.fn(async () => {})

    const result = await adoptDiskAndReload(['世界观/甲.md'], {
      discard: (relPath) => h.discard(relPath),
      drain: () => h.drain(),
      status: () => h.status,
      reload,
    })

    expect(result.status).toBe('blocked')
    if (result.status === 'blocked') {
      expect(result.failures.map((failure) => failure.stage)).toEqual(['disk', 'conflict'])
    }
    expect(reload).not.toHaveBeenCalled()
  })

  test('丢弃后队列仍有未确认写入：blocked，不读盘', async () => {
    h.status.pending = 2
    const reload = vi.fn(async () => {})
    const result = await adoptDiskAndReload(['世界观/甲.md'], {
      discard: (relPath) => h.discard(relPath),
      drain: () => h.drain(),
      status: () => h.status,
      reload,
    })
    expect(result.status).toBe('blocked')
    expect(reload).not.toHaveBeenCalled()
  })

  test('刚放弃的条目即使出现在历史冲突报告里，也不再阻断', async () => {
    // 会话 A2 / Q03 之前的实现可能把已解决冲突留在 report 里；采用磁盘不应被它卡死
    h.drain.mockResolvedValue(emptyReport({ conflicts: ['世界观/甲.md'] }))
    const reload = vi.fn(async () => {})

    const result = await adoptDiskAndReload(['世界观/甲.md'], {
      discard: (relPath) => h.discard(relPath),
      drain: () => h.drain(),
      status: () => h.status,
      reload,
    })

    expect(result).toEqual({ status: 'reloaded' })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  test('读盘失败返回 failed', async () => {
    const result = await adoptDiskAndReload(['世界观/甲.md'], {
      discard: (relPath) => h.discard(relPath),
      drain: () => h.drain(),
      status: () => h.status,
      reload: async () => {
        throw new Error('loadVault 失败')
      },
    })
    expect(result).toEqual({ status: 'failed', error: 'loadVault 失败' })
  })
})

describe('采用磁盘版本的确认状态机', () => {
  test('取消：Promise 返回 false，两边不变（不触发 discard / drain）', async () => {
    const changes: Array<ConflictConfirmationRequest | null> = []
    const confirmation = createConflictConfirmation((request) => changes.push(request))

    const answered = confirmation.request([' 世界观/甲.md ', '世界观/乙.md', '世界观/甲.md'])
    expect(confirmation.pending()?.paths).toEqual(['世界观/甲.md', '世界观/乙.md'])
    confirmation.answer(false)

    await expect(answered).resolves.toBe(false)
    expect(confirmation.pending()).toBeNull()
    expect(changes.map((request) => request?.paths ?? null)).toEqual([
      ['世界观/甲.md', '世界观/乙.md'],
      null,
    ])
    expect(h.discard).not.toHaveBeenCalled()
    expect(h.drain).not.toHaveBeenCalled()
  })

  test('确认返回 true；新请求会把上一个按取消结束，不让调用方悬空', async () => {
    const confirmation = createConflictConfirmation(() => {})
    const first = confirmation.request(['a.md'])
    const second = confirmation.request(['b.md'])

    await expect(first).resolves.toBe(false)
    expect(confirmation.pending()?.paths).toEqual(['b.md'])

    confirmation.answer(true)
    await expect(second).resolves.toBe(true)
    expect(confirmation.pending()).toBeNull()
  })
})

describe('重载结果必须能回到调用方', () => {
  test('成功返回 null；失败 / 取消 / 阻断各自给出原因', () => {
    expect(describeReloadBlock({ status: 'reloaded' })).toBeNull()
    expect(
      describeReloadBlock({
        status: 'blocked',
        failures: [{ stage: 'conflict', relPath: '甲.md', message: '磁盘版本更新' }],
      }),
    ).toBe('磁盘版本更新')
    expect(describeReloadBlock({ status: 'blocked', failures: [] })).toContain('磁盘冲突')
    expect(describeReloadBlock({ status: 'cancelled' })).toBe('已取消重新载入')
    expect(describeReloadBlock({ status: 'failed', error: '读盘失败' })).toBe('读盘失败')
  })
})

describe('冲突回执同时提供两个明确方向', () => {
  test('主按钮是「采用磁盘版本」，次按钮是「覆盖磁盘」', async () => {
    const adoptDisk = vi.fn()
    reportSaveBarrierFailures(
      [
        { stage: 'conflict', relPath: '世界观/甲.md', message: '磁盘版本更新' },
        { stage: 'draft', message: '草稿还没保存' },
      ],
      { adoptDisk },
    )

    const lastCall = vi.mocked(toast.error).mock.calls.at(-1)
    expect(lastCall?.[0]).toBe('保存未完成')
    const options = lastCall?.[1] as {
      action: { label: string; onClick: () => void }
      cancel: { label: string; onClick: () => void }
    }
    expect(options.action.label).toBe('采用磁盘版本')
    expect(options.cancel.label).toBe('覆盖磁盘')

    // 采用磁盘只是打开确认，不写任何文件
    options.action.onClick()
    expect(adoptDisk).toHaveBeenCalledWith(['世界观/甲.md'])
    expect(h.drain).not.toHaveBeenCalled()

    // 覆盖磁盘仍走明确的重写路径
    options.cancel.onClick()
    await Promise.resolve()
    expect(h.drain).toHaveBeenCalledWith({ overwriteConflicts: true })
  })

  test('没有 adoptDisk 入口时保持原来的「覆盖磁盘」行为', () => {
    reportSaveBarrierFailures([
      { stage: 'conflict', relPath: '世界观/乙.md', message: '冲突' },
    ])
    const options = vi.mocked(toast.error).mock.calls.at(-1)?.[1] as {
      action: { label: string }
    }
    expect(options.action.label).toBe('覆盖磁盘')
  })
})
