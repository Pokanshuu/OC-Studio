/**
 * 助手工具的执行边界（F16）。
 *
 * 产品承诺「笔记库模式下，实体写入只走 library_*」，但上游工具面里还有
 * `write_file` / `edit_file` / `run_shell`。只在系统提示词里写「不要用」不算
 * 执行端约束：模型仍可能调，旧会话也可能带着旧工具名重放。
 *
 * 这里做三件事：
 * 1. **默认工具面**：原始文件写入与 shell 默认不发给模型；只有用户显式打开
 *    「高级写入权限 / Shell」才进入请求。
 * 2. **执行端校验**：即使工具出现在请求里（旧历史、手工构造），实体 `.md`
 *    与 `.ocstudio/` 内部配置的原始写入一律拒绝 —— 这两类只能走 library_*。
 * 3. **原生兜底**：`run_tool` 额外收到 `allowShell`，Rust 端再拒一次未经授权的
 *    shell；写 `.md` / `.ocstudio` 也由 Rust 再拦一次（防渲染层绕过）。
 *
 * 策略存 localStorage（宿主自己的偏好，不写进 `.ocstudio`，也不进 `.ocbak`）。
 * 它不是权限系统：只是「用户是否显式授权了高级工具」的产品开关。真正的
 * 路径沙箱仍在 Rust。
 */
import { invoke } from '@tauri-apps/api/core'

import type { ToolResponse } from '@/plugins/agent/core/types'

export interface AgentToolPolicy {
  /**
   * 是否允许 `write_file` / `edit_file` 写**非实体文件**。实体 `.md` 与
   * `.ocstudio/` 永远不允许，即使打开这个开关。
   */
  rawFileWrites: boolean
  /** 是否允许 `run_shell`。会绕过实体/内部配置的写入限制，必须显式授权。 */
  shell: boolean
}

const STORAGE_KEY = 'oc-agent-tool-policy-v1'
const DEFAULT_POLICY: AgentToolPolicy = { rawFileWrites: false, shell: false }

function readPolicy(): AgentToolPolicy {
  if (typeof window === 'undefined') return { ...DEFAULT_POLICY }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_POLICY }
    const parsed = JSON.parse(raw) as Partial<AgentToolPolicy> | null
    return {
      rawFileWrites: parsed?.rawFileWrites === true,
      shell: parsed?.shell === true,
    }
  } catch {
    return { ...DEFAULT_POLICY }
  }
}

let current = readPolicy()
const listeners = new Set<(policy: AgentToolPolicy) => void>()

export function getAgentToolPolicy(): AgentToolPolicy {
  return current
}

export function subscribeAgentToolPolicy(listener: (policy: AgentToolPolicy) => void): () => void {
  listeners.add(listener)
  listener(current)
  return () => {
    listeners.delete(listener)
  }
}

export function setAgentToolPolicy(patch: Partial<AgentToolPolicy>): AgentToolPolicy {
  current = { ...current, ...patch }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
    } catch {
      // 存不下（隐私模式 / 配额）也不能影响这次会话的授权
    }
  }
  for (const listener of listeners) listener(current)
  return current
}

export function isRawWriteTool(name: string): boolean {
  return name === 'write_file' || name === 'edit_file'
}

export function isShellTool(name: string): boolean {
  return name === 'run_shell'
}

/**
 * 实体笔记（`.md`）与内部配置（任意层级的 `.ocstudio/`）不允许原始写入。
 *
 * 这里只做产品层的路径识别；路径逃逸、大小写、symlink 由 Rust 的
 * `resolve_new` / `createOnly` 负责。
 */
export function isProtectedLibraryPath(path: string): boolean {
  const normalized = path.trim().replace(/\\/g, '/').toLowerCase()
  if (normalized === '') return false
  // Windows 会静默去掉每段末尾的空格 / 点：`角色/林.md ` 实际会写成 `林.md`。
  // 判断前按同样规则归一，否则给 `.md` / `.ocstudio` 加个尾随空格就能绕过。
  const segments = normalized.split('/').map((segment) => segment.replace(/[ .]+$/, ''))
  const trimmed = segments.join('/')
  if (trimmed.endsWith('.md')) return true
  return segments.some((segment) => segment === '.ocstudio')
}

export type AgentToolDecision = { allowed: true } | { allowed: false; reason: string }

/**
 * 执行前校验。`name` 必须已经是**规范名**（旧 `library_*` 别名先由调用方映射）。
 */
export function checkAgentToolPolicy(
  name: string,
  args: Record<string, unknown>,
  policy: AgentToolPolicy = current,
): AgentToolDecision {
  if (isRawWriteTool(name)) {
    const path = typeof args.path === 'string' ? args.path : ''
    if (path.trim() === '') {
      return { allowed: false, reason: '缺少 path，已拒绝这次原始文件写入。' }
    }
    if (isProtectedLibraryPath(path)) {
      return {
        allowed: false,
        reason:
          '实体笔记（.md）和 .ocstudio 内部配置只能通过 library_* 工具写入；' +
          '原始文件工具不能修改它们。要改条目请用 library_set_fields / library_set_body / library_rename。',
      }
    }
    if (!policy.rawFileWrites) {
      return {
        allowed: false,
        reason:
          '原始文件写入默认关闭。需要写非实体文件时，请作者在「助手 › 设置 › 高级工具」里显式开启。',
      }
    }
    return { allowed: true }
  }

  if (isShellTool(name) && !policy.shell) {
    return {
      allowed: false,
      reason:
        'Shell 命令默认关闭：它可以在笔记库目录执行任意命令，并绕过实体写入限制。' +
        '需要时请作者在「助手 › 设置 › 高级工具」里显式开启。',
    }
  }

  return { allowed: true }
}

/** 本轮请求要不要把某个工具发给模型（不看参数；参数级校验在 execute） */
export function isToolAllowedByPolicy(
  name: string,
  policy: AgentToolPolicy = current,
): boolean {
  if (isRawWriteTool(name)) return policy.rawFileWrites
  if (isShellTool(name)) return policy.shell
  return true
}

export function filterAgentTools<T extends { name: string }>(
  tools: T[],
  policy: AgentToolPolicy = current,
): T[] {
  return tools.filter((tool) => isToolAllowedByPolicy(tool.name, policy))
}

/**
 * 走 Rust 执行一次工具，并把用户的 shell 授权一并带过去。
 *
 * 为什么不用 `api/bridge.ts` 的 `runTool`：那属于插件的上游目录，保持原样；
 * 宿主在 `chat.ts` 的「宿主差异」里换用这个包装即可。
 */
export function runAgentTool(
  name: string,
  args: Record<string, unknown>,
  workspace: string,
  policy: AgentToolPolicy = current,
): Promise<ToolResponse> {
  return invoke<ToolResponse>('run_tool', {
    name,
    args,
    workspace,
    allowShell: policy.shell,
  })
}
