import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { VaultFlushReport } from '@/lib/vault/vault-persist'
import type { VaultReloadResult } from '@/lib/vault/vault-reload'

/**
 * Q08 的 provider 级冲突选择回归：
 * - 普通刷新被冲突拦下时返回 blocked，不重载；
 * - 采用磁盘版本必须先经过确认；确认前不 discard、不读盘；
 * - 取消返回 cancelled，两边都不动；
 * - 确认后 discard → drain（不带 overwriteConflicts）→ loadVault，并把结果返回。
 */

const h = vi.hoisted(() => ({
  discard: vi.fn(),
  drain: vi.fn(),
  status: { pending: 0, flushing: false },
  loadVault: vi.fn(),
  probe: vi.fn(),
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
  installVaultPersist: vi.fn(),
  subscribeVaultWriteStatus: () => () => {},
}))

vi.mock('@/lib/vault/vault-fs', () => ({
  isVaultSupported: () => true,
  vaultFs: { probe: h.probe },
}))

vi.mock('@/lib/vault/vault-load', () => ({ loadVault: h.loadVault }))

vi.mock('@/lib/vault/vault-registry', () => ({
  lastVaultPath: () => null,
  listRecentVaults: () => [],
  rememberVault: vi.fn(),
  vaultNameFromPath: (path: string) => path,
}))

vi.mock('@/lib/vault/export-dir', () => ({ exportLegacyToFolder: vi.fn() }))
vi.mock('@/lib/vault/legacy-backup', () => ({ backupLegacyData: vi.fn(async () => null) }))
vi.mock('@/lib/image-service', () => ({ setVaultImageContext: vi.fn() }))
vi.mock('@/lib/data-events', () => ({ notifyDataUpdated: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

import { createVaultSession } from '@/lib/vault/vault-session'
import { VaultProvider, useVault } from '@/lib/vault/vault-provider'
import { registerPendingSave } from '@/lib/pending-saves'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

function loadResult(): unknown {
  return {
    scan: {},
    session: createVaultSession('/mem-vault'),
    counts: { characters: 0, countries: 0, events: 0, worldEntries: 0, tags: 0 },
    warnings: [],
    otherFiles: [],
    dirs: [],
    truncated: false,
  }
}

type VaultApi = ReturnType<typeof useVault>

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  h.discard.mockReset()
  h.drain.mockReset()
  h.drain.mockResolvedValue(emptyReport())
  h.status.pending = 0
  h.status.flushing = false
  h.loadVault.mockReset()
  h.loadVault.mockImplementation(async () => loadResult())
  h.probe.mockReset()
  h.probe.mockResolvedValue({ exists: true, isDir: true, hasMarker: true })
})

afterEach(async () => {
  if (root !== null) {
    await act(async () => {
      root?.unmount()
    })
  }
  root = null
  container?.remove()
  container = null
})

async function mountProvider(): Promise<() => VaultApi> {
  let api: VaultApi | null = null
  function Probe() {
    api = useVault()
    return null
  }

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(VaultProvider, null, React.createElement(Probe)),
      ),
    )
  })
  return () => {
    if (api === null) throw new Error('VaultProvider 未挂载')
    return api
  }
}

describe('Q08 provider：普通刷新与采用磁盘版本', () => {
  test('flushes drafts before discovery and again after confirmation, before discarding', async () => {
    const getApi = await mountProvider()
    await act(async () => { await getApi().openFolder('/mem-vault') })
    const order: string[] = []
    const unregister = registerPendingSave(async () => { order.push('draft') })
    h.discard.mockImplementation(() => { order.push('discard') })
    let adoption: Promise<VaultReloadResult> | undefined
    try {
      await act(async () => {
        adoption = getApi().adoptDiskVersion(['世界观/甲.md'])
        await Promise.resolve()
      })
      expect(order).toEqual(['draft'])
      await act(async () => {
        getApi().answerConflictChoice(true)
        await adoption
      })
      expect(order).toEqual(['draft', 'draft', 'discard'])
      expect(getApi().status).toBe('ready')
    } finally {
      unregister()
    }
  })

  test('draft failure blocks adoption without discarding or reloading', async () => {
    const getApi = await mountProvider()
    await act(async () => { await getApi().openFolder('/mem-vault') })
    const unregister = registerPendingSave(async () => { throw new Error('正文提交失败') })
    try {
      let result: VaultReloadResult | undefined
      await act(async () => { result = await getApi().adoptDiskVersion(['世界观/甲.md']) })
      expect(result?.status).toBe('blocked')
      expect(h.discard).not.toHaveBeenCalled()
      expect(h.loadVault).toHaveBeenCalledTimes(1)
      expect(getApi().status).toBe('ready')
    } finally {
      unregister()
    }
  })

  test('刷新被冲突拦下返回 blocked，不读盘；取消采用磁盘后两边不变', async () => {
    const getApi = await mountProvider()
    await act(async () => {
      await getApi().openFolder('/mem-vault')
    })
    expect(getApi().root).toBe('/mem-vault')
    expect(h.loadVault).toHaveBeenCalledTimes(1)

    h.drain.mockResolvedValue(emptyReport({ conflicts: ['世界观/甲.md'] }))
    let refresh: VaultReloadResult | undefined
    await act(async () => {
      refresh = await getApi().rescan()
    })
    expect(refresh?.status).toBe('blocked')
    expect(h.loadVault).toHaveBeenCalledTimes(1)

    // 点「采用磁盘版本」：先弹确认，确认前不 discard、不读盘
    let adoption: Promise<VaultReloadResult> | undefined
    await act(async () => {
      adoption = getApi().adoptDiskVersion(['世界观/甲.md'])
      await Promise.resolve()
    })
    expect(getApi().conflictChoice?.paths).toEqual(['世界观/甲.md'])
    expect(h.discard).not.toHaveBeenCalled()
    expect(h.loadVault).toHaveBeenCalledTimes(1)

    // 取消 = 两边都不动
    let adopted: VaultReloadResult | undefined
    await act(async () => {
      getApi().answerConflictChoice(false)
      adopted = await adoption
    })
    expect(adopted).toEqual({ status: 'cancelled' })
    expect(h.discard).not.toHaveBeenCalled()
    expect(h.loadVault).toHaveBeenCalledTimes(1)
    expect(getApi().conflictChoice).toBeNull()
  })

  test('确认后 discard → drain（不覆盖磁盘）→ 读盘，并返回 reloaded', async () => {
    const getApi = await mountProvider()
    await act(async () => {
      await getApi().openFolder('/mem-vault')
    })
    // 历史报告里仍带着刚放弃的冲突：也不应阻断（与 Q03 的最终状态语义对齐）
    h.drain.mockResolvedValue(emptyReport({ conflicts: ['世界观/甲.md'] }))

    let adoption: Promise<VaultReloadResult> | undefined
    await act(async () => {
      adoption = getApi().adoptDiskVersion(['世界观/甲.md'])
      await Promise.resolve()
    })
    expect(getApi().conflictChoice?.paths).toEqual(['世界观/甲.md'])

    let adopted: VaultReloadResult | undefined
    await act(async () => {
      getApi().answerConflictChoice(true)
      adopted = await adoption
    })

    expect(adopted).toEqual({ status: 'reloaded' })
    expect(h.discard).toHaveBeenCalledWith('世界观/甲.md')
    expect(h.loadVault).toHaveBeenCalledTimes(2)
    // 确认采用磁盘绝不能先把本地版本覆盖到外部文件
    expect(h.drain).not.toHaveBeenCalledWith(
      expect.objectContaining({ overwriteConflicts: true }),
    )
  })
})
