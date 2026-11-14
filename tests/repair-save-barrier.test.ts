import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import type { VaultFlushReport } from '@/lib/vault/vault-persist'
import type { SaveBarrierFailure } from '@/lib/save-barrier'
import type { SaveOutcome } from '@/lib/save-outcome'

/**
 * 保存屏障 / 关窗协调 / 换库顺序的正式回归。
 *
 * 这些测试只模拟 `drainVaultWrites` 的返回值（会话 A 的契约：等完在途批次再 resolve），
 * 不打开真实用户库，也不改探针断言。
 */

const vault = vi.hoisted(() => {
  const drain = vi.fn()
  const status = {
    pending: 0,
    flushing: false,
    lastError: null as string | null,
    lastFlushedAt: null as number | null,
  }
  return { drain, status }
})

vi.mock('@/lib/vault/vault-persist', () => ({
  drainVaultWrites: vault.drain,
  currentStatus: () => ({
    pending: vault.status.pending,
    flushing: vault.status.flushing,
    lastError: vault.status.lastError,
    lastFlushedAt: vault.status.lastFlushedAt,
  }),
}))

import { flushPendingSaves, PendingSaveError, registerPendingSave } from '@/lib/pending-saves'
import { runGuardedTransition, runSaveBarrier } from '@/lib/save-barrier'
import { createCloseCoordinator } from '@/lib/close-coordinator'
import { SaveStatusProvider, useSaveStatus } from '@/components/layout/SaveStatusContext'

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

const disposers: Array<() => void> = []

function register(flusher: () => void | Promise<void>): void {
  disposers.push(registerPendingSave(flusher))
}

beforeEach(() => {
  vault.drain.mockReset()
  vault.drain.mockResolvedValue(emptyReport())
  vault.status.pending = 0
  vault.status.flushing = false
})

afterEach(async () => {
  for (const dispose of disposers.splice(0)) dispose()
  // 把可能还在进行中的一轮 flush 收尾，避免串到下一个用例
  await flushPendingSaves().catch(() => undefined)
})

describe('flushPendingSaves 契约', () => {
  test('R17 正式回归：有草稿保存被拒绝时必须 reject，不能当成功', async () => {
    register(async () => {
      throw new Error('保存失败')
    })

    const error = await flushPendingSaves().then(
      () => null,
      (reason: unknown) => reason,
    )
    expect(error).toBeInstanceOf(PendingSaveError)
    expect((error as PendingSaveError).message).toContain('保存失败')
  })

  test('收集全部失败，同时仍然跑完其它草稿', async () => {
    const ran: string[] = []
    register(async () => {
      ran.push('ok')
    })
    register(async () => {
      throw new Error('A 保存失败')
    })
    register(async () => {
      await Promise.resolve()
      throw new Error('B 保存失败')
    })

    const error = (await flushPendingSaves().catch((reason: unknown) => reason)) as PendingSaveError
    expect(error).toBeInstanceOf(PendingSaveError)
    expect(error.failures).toHaveLength(2)
    expect(error.failures.join('|')).toContain('A 保存失败')
    expect(error.failures.join('|')).toContain('B 保存失败')
    expect(ran).toEqual(['ok'])
  })

  test('全部成功才 resolve，并且真的等到异步 flush 完成', async () => {
    let finished = false
    register(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      finished = true
    })

    await flushPendingSaves()
    expect(finished).toBe(true)
  })
})

describe('runSaveBarrier', () => {
  test('顺序：先等草稿写完，再 drain 落盘队列；全绿才算过', async () => {
    const events: string[] = []
    register(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      events.push('draft')
    })
    vault.drain.mockImplementation(async () => {
      events.push('drain')
      return emptyReport()
    })

    const failures = await runSaveBarrier()
    expect(events).toEqual(['draft', 'drain'])
    expect(failures).toEqual([])
  })

  test('草稿失败不阻断 drain，错误 / 冲突全部收集并标明阶段', async () => {
    register(async () => {
      throw new Error('草稿保存失败')
    })
    vault.drain.mockResolvedValue(
      emptyReport({
        errors: [{ relPath: '世界观/甲.md', message: '磁盘已满' }],
        conflicts: ['世界观/乙.md'],
      }),
    )

    const failures = await runSaveBarrier()
    expect(failures.map((failure) => failure.stage)).toEqual(['draft', 'disk', 'conflict'])
    expect(failures[0]?.message).toContain('草稿保存失败')
    expect(failures[1]?.message).toContain('磁盘已满')
    expect(failures[2]?.message).toContain('乙.md')
  })

  test('drain 抛错也算失败（整次 IPC 拒绝不能当成写完）', async () => {
    vault.drain.mockRejectedValue(new Error('IPC 拒绝'))
    const failures = await runSaveBarrier()
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatchObject({ stage: 'disk' })
    expect(failures[0]?.message).toContain('IPC 拒绝')
  })

  test('drain 返回后队列仍有未确认写入：不允许离场', async () => {
    vault.status.pending = 2
    const failures = await runSaveBarrier()
    expect(failures.some((failure) => failure.message.includes('2 项'))).toBe(true)
  })
})

describe('换库顺序（先屏障、后卸载编辑器）', () => {
  test('屏障失败时不进入 loading、不加载新库，原会话保留', async () => {
    const order: string[] = []
    const blocked: SaveBarrierFailure[][] = []

    const result = await runGuardedTransition(
      async () => {
        order.push('barrier')
        return [{ stage: 'draft', message: '保存失败' }]
      },
      (failures) => {
        order.push('blocked')
        blocked.push(failures)
      },
      async () => {
        order.push('loading+load')
      },
    )

    expect(result.ok).toBe(false)
    expect(order).toEqual(['barrier', 'blocked'])
    expect(blocked).toHaveLength(1)
  })

  test('屏障全绿后才进入 loading 并加载新库', async () => {
    const order: string[] = []
    const result = await runGuardedTransition(
      async () => {
        order.push('barrier')
        return []
      },
      () => {
        order.push('blocked')
      },
      async () => {
        order.push('loading+load')
        return '新库'
      },
    )

    expect(result).toEqual({ ok: true, value: '新库' })
    expect(order).toEqual(['barrier', 'loading+load'])
  })
})

describe('SaveStatusContext.requestSave 契约', () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  let statusRoot: Root | null = null
  let statusContainer: HTMLDivElement | null = null

  async function mountProvider(handler: (() => Promise<SaveOutcome>) | null): Promise<() => Promise<SaveOutcome>> {
    let requestSave: () => Promise<SaveOutcome> = async () => ({ status: 'none' })

    function Probe({ saveHandler }: { saveHandler: (() => Promise<SaveOutcome>) | null }) {
      const context = useSaveStatus()
      requestSave = context.requestSave
      React.useEffect(() => {
        context.setActiveEntity('country')
        if (saveHandler !== null) context.registerSaveHandler('country', saveHandler)
        return () => context.registerSaveHandler('country', null)
        // context 对象每次 render 都会换，但 register/setActive 只写 ref，不会触发重渲染
      }, [context, saveHandler])
      return null
    }

    statusContainer = document.createElement('div')
    document.body.append(statusContainer)
    statusRoot = createRoot(statusContainer)
    await act(async () => {
      statusRoot?.render(
        React.createElement(
          SaveStatusProvider,
          null,
          React.createElement(Probe, { saveHandler: handler }),
        ),
      )
    })
    return requestSave
  }

  afterEach(async () => {
    if (statusRoot !== null) {
      await act(async () => {
        statusRoot?.unmount()
      })
    }
    statusRoot = null
    statusContainer?.remove()
    statusContainer = null
  })

  test('等待登记的异步保存结果（失败原样返回）', async () => {
    const handler = vi.fn(
      async (): Promise<SaveOutcome> => ({
        status: 'failed',
        error: new Error('保存失败'),
      }),
    )
    const requestSave = await mountProvider(handler)

    let outcome: SaveOutcome | undefined
    await act(async () => {
      outcome = await requestSave()
    })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(outcome).toMatchObject({ status: 'failed' })
    expect((outcome as { error: Error }).error.message).toBe('保存失败')
  })

  test('没有登记处理器时返回 none，而不是假的已保存', async () => {
    const requestSave = await mountProvider(null)
    let outcome: SaveOutcome | undefined
    await act(async () => {
      outcome = await requestSave()
    })
    expect(outcome).toEqual({ status: 'none' })
  })
})

describe('createCloseCoordinator', () => {
  test('a rejected native destroy can be retried and concurrent forced closes share one attempt', async () => {
    const destroy = vi.fn().mockRejectedValueOnce(new Error('native close failed')).mockResolvedValue(undefined)
    const coordinator = createCloseCoordinator({ runBarrier: async () => [], destroy, onBlocked: vi.fn() })
    await expect(coordinator.requestClose()).rejects.toThrow('native close failed')
    expect(coordinator.isBusy()).toBe(false)
    await expect(Promise.all([coordinator.forceClose(), coordinator.forceClose()])).resolves.toEqual([undefined, undefined])
    expect(destroy).toHaveBeenCalledTimes(2)
    await expect(coordinator.requestClose()).resolves.toBe('closed')
    expect(destroy).toHaveBeenCalledTimes(2)
  })

  test('保存失败不关闭；重复关闭不并发跑屏障，也不 destroy 两次', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined)
    const onBlocked = vi.fn()
    let release: (failures: SaveBarrierFailure[]) => void = () => {}
    const gate = new Promise<SaveBarrierFailure[]>((resolve) => {
      release = resolve
    })
    const coordinator = createCloseCoordinator({
      runBarrier: () => gate,
      destroy,
      onBlocked,
    })

    const first = coordinator.requestClose()
    expect(coordinator.isBusy()).toBe(true)
    await expect(coordinator.requestClose()).resolves.toBe('ignored')

    release([])
    await expect(first).resolves.toBe('closed')
    expect(destroy).toHaveBeenCalledTimes(1)

    // 已经关过：后续事件不再 destroy
    await expect(coordinator.requestClose()).resolves.toBe('closed')
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  test('用户明确「仍然关闭」时只 destroy 一次，后续关闭事件不再重复', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined)
    const coordinator = createCloseCoordinator({
      runBarrier: async () => [{ stage: 'draft', message: '保存失败' }],
      destroy,
      onBlocked: () => {},
    })

    await coordinator.forceClose()
    await coordinator.forceClose()
    expect(destroy).toHaveBeenCalledTimes(1)
    await expect(coordinator.requestClose()).resolves.toBe('closed')
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  test('失败阻止关闭并给出回执；下一次关闭会重试', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined)
    const onBlocked = vi.fn()
    const runBarrier = vi
      .fn<() => Promise<SaveBarrierFailure[]>>()
      .mockResolvedValueOnce([{ stage: 'conflict', message: '磁盘版本更新' }])
      .mockResolvedValueOnce([])
    const coordinator = createCloseCoordinator({ runBarrier, destroy, onBlocked })

    await expect(coordinator.requestClose()).resolves.toBe('blocked')
    expect(onBlocked).toHaveBeenCalledWith([{ stage: 'conflict', message: '磁盘版本更新' }])
    expect(destroy).not.toHaveBeenCalled()

    await expect(coordinator.requestClose()).resolves.toBe('closed')
    expect(destroy).toHaveBeenCalledTimes(1)
  })
})
