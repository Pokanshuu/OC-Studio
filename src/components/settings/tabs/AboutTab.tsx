'use client'

import { APP_VERSION } from '@/lib/version'
export function AboutTab() {
  return (
    <>
              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink">版本</span>
                  <span className="text-sm text-ink-muted font-mono">
                    v{APP_VERSION}
                  </span>
                </div>
                <button
                  disabled
                  className="inline-flex h-8 items-center justify-center px-3 text-[13px] text-ink-faint cursor-not-allowed"
                >
                  检查更新
                </button>
                <a
                  href="https://github.com/Pokanshuu/OC-Studio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="touch-feedback inline-flex h-8 items-center justify-center px-3 text-[13px] text-ink transition-colors hover:bg-[var(--oc-hover)]"
                >
                  访问 GitHub 项目
                </a>
                <p className="text-xs text-ink-faint pt-2 border-t border-line">
                  OC Studio — 原创角色与世界观创作工作台
                </p>
              </div>
    </>
  )
}


