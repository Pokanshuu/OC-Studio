'use client'

import { useState } from 'react'
import { ArrowLeft, ChevronRight, ExternalLink } from 'lucide-react'

import { APP_VERSION } from '@/lib/version'
import { openExternal } from '@/lib/open-external'
import { BTN_PRIMARY, ICON_BTN } from '@/lib/ui-tokens'
import { CREDIT_GROUPS, type CreditItem } from '../credits'

const REPO_URL = 'https://github.com/Pokanshuu/OC-Studio'

function CreditRow({ item }: { item: CreditItem }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-b-0">
      <button
        type="button"
        onClick={() => void openExternal(item.url)}
        className="group flex min-w-0 items-baseline gap-2 text-left"
        title={item.url}
      >
        <span className="shrink-0 text-[13px] text-ink underline-offset-2 group-hover:underline">{item.name}</span>
        {item.note ? <span className="truncate text-[11px] text-ink-faint">{item.note}</span> : null}
      </button>
      <span className="shrink-0 text-[11px] text-ink-faint">{item.license}</span>
    </div>
  )
}

export function AboutTab() {
  /** 二级界面：开源许可（一长串致谢不铺在一级页面上） */
  const [panel, setPanel] = useState<'root' | 'credits'>('root')

  if (panel === 'credits') {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPanel('root')}
            aria-label="返回"
            className={ICON_BTN}
          >
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          <span className="text-sm text-ink">开源许可</span>
        </div>

        {CREDIT_GROUPS.map((group) => (
          <div key={group.title}>
            <h3 className="mb-1 text-[11px] tracking-[0.08em] text-ink-faint">{group.title}</h3>
            {group.items.map((item) => (
              <CreditRow key={item.name} item={item} />
            ))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink">版本</span>
        <span className="font-mono text-sm text-ink-muted">v{APP_VERSION}</span>
      </div>

      <button
        disabled
        className="flex h-8 w-full cursor-not-allowed items-center justify-center gap-2 text-[13px] text-ink-faint"
      >
        检查更新
        <span className="text-[11px] text-ink-faint">开发中</span>
      </button>

      <button
        type="button"
        onClick={() => void openExternal(REPO_URL)}
        className={`${BTN_PRIMARY} w-full justify-center`}
      >
        <ExternalLink size={13} strokeWidth={2} />
        访问 GitHub 项目
      </button>

      {/* 二级界面入口：开源许可整份收进下一级 */}
      <button
        type="button"
        onClick={() => setPanel('credits')}
        className="flex items-center justify-between border-t border-line pt-4 text-sm text-ink transition-colors hover:bg-transparent hover:text-ink-muted"
      >
        <span>开源许可</span>
        <ChevronRight size={16} strokeWidth={2} className="text-ink-faint" />
      </button>
    </div>
  )
}
