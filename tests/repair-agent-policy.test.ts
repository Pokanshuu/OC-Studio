import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 助手工具边界回归（审查 F16）。
 *
 * 这里不是「函数被调用」的测试：默认工具面、实体路径识别、shell 授权传递都
 * 按真实执行会走到的分支断言。原生侧另有 `cargo test` 的 `run_tool` 拦截用例。
 */

const h = vi.hoisted(() => ({
  invoke: vi.fn(async () => ({ content: 'ok', isError: false, durationMs: 0 })),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: h.invoke }))

import {
  checkAgentToolPolicy,
  filterAgentTools,
  getAgentToolPolicy,
  isProtectedLibraryPath,
  isToolAllowedByPolicy,
  runAgentTool,
  setAgentToolPolicy,
} from '@/plugins/agent/host/tool-policy'

beforeEach(() => {
  h.invoke.mockClear()
  setAgentToolPolicy({ rawFileWrites: false, shell: false })
})

describe('F16 默认工具面', () => {
  it('默认不把原始写入与 shell 发给模型，library_* 仍保留', () => {
    const tools = [
      { name: 'library_set_fields' },
      { name: 'library_create' },
      { name: 'write_file' },
      { name: 'edit_file' },
      { name: 'run_shell' },
      { name: 'read_file' },
    ]
    expect(filterAgentTools(tools).map((tool) => tool.name)).toEqual([
      'library_set_fields',
      'library_create',
      'read_file',
    ])
    expect(isToolAllowedByPolicy('run_shell')).toBe(false)
    expect(isToolAllowedByPolicy('write_file')).toBe(false)
  })

  it('显式打开后才放行对应工具，互不连带', () => {
    setAgentToolPolicy({ rawFileWrites: true })
    expect(isToolAllowedByPolicy('write_file')).toBe(true)
    expect(isToolAllowedByPolicy('edit_file')).toBe(true)
    expect(isToolAllowedByPolicy('run_shell')).toBe(false)

    setAgentToolPolicy({ shell: true })
    expect(isToolAllowedByPolicy('run_shell')).toBe(true)
  })
})

describe('F16 实体与内部配置不能走原始写入', () => {
  it('识别 .md（大小写）与任意层级的 .ocstudio，附件不受影响', () => {
    expect(isProtectedLibraryPath('角色/林知遥.md')).toBe(true)
    expect(isProtectedLibraryPath('角色/林知遥.MD')).toBe(true)
    expect(isProtectedLibraryPath('.ocstudio/tags.json')).toBe(true)
    expect(isProtectedLibraryPath('子目录/.ocstudio/fields.json')).toBe(true)
    // Windows 会去掉段尾空格 / 点：不能靠尾随字符绕过
    expect(isProtectedLibraryPath('角色/林知遥.md ')).toBe(true)
    expect(isProtectedLibraryPath('.ocstudio./tags.json')).toBe(true)
    expect(isProtectedLibraryPath('附件/cover.png')).toBe(false)
    expect(isProtectedLibraryPath('导出/说明.txt')).toBe(false)
  })

  it('即使打开原始写入，实体 .md 与内部配置仍被拒绝', () => {
    setAgentToolPolicy({ rawFileWrites: true })
    const markdown = checkAgentToolPolicy('write_file', { path: '角色/林知遥.md', content: 'x' })
    expect(markdown.allowed).toBe(false)
    if (!markdown.allowed) expect(markdown.reason).toContain('library_*')

    const internal = checkAgentToolPolicy('edit_file', { path: '.ocstudio/tags.json' })
    expect(internal.allowed).toBe(false)
    if (!internal.allowed) expect(internal.reason).toContain('library_*')
  })

  it('打开原始写入后，非实体文件可以写', () => {
    setAgentToolPolicy({ rawFileWrites: true })
    expect(checkAgentToolPolicy('write_file', { path: '附件/cover.png' }).allowed).toBe(true)
  })

  it('没打开原始写入时，连非实体文件也拒绝', () => {
    const decision = checkAgentToolPolicy('write_file', { path: '附件/cover.png' })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.reason).toContain('高级工具')
  })
})

describe('F16 Shell 显式授权', () => {
  it('默认拒绝，并说明是高级能力', () => {
    const decision = checkAgentToolPolicy('run_shell', { command: 'echo hi' })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.reason).toContain('高级工具')
    expect(getAgentToolPolicy().shell).toBe(false)
  })

  it('执行时把 allowShell 传给原生层；默认传 false', async () => {
    await runAgentTool('run_shell', { command: 'echo hi' }, 'C:/vault')
    expect(h.invoke).toHaveBeenCalledWith('run_tool', expect.objectContaining({ allowShell: false }))

    setAgentToolPolicy({ shell: true })
    await runAgentTool('run_shell', { command: 'echo hi' }, 'C:/vault')
    expect(h.invoke).toHaveBeenCalledWith('run_tool', expect.objectContaining({ allowShell: true }))
  })
})
