'use client'

/**
 * 「＋ 新建」弹出的节点创建框（docs/关系图.md §10）。
 *
 * 只造三类实体：角色 / 国家 / 事件。分类条目不在图上新建 ——
 * 它属于某个分类与模板，得在分类页里建（那里才知道该套哪个模板）。
 *
 * 建完就落在**当前视口中心**（见 RelationGraph 的 handleCreateNode）：
 * 新节点没有坐标时力导向会把它排到已钉住节点的质心周围，几十个节点时那圈半径几百像素，
 * 十有八九落在屏幕外 —— 「点了新建但什么都看不见」。
 */
import { useState } from 'react'
import { Check } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BTN_PRIMARY, BTN_QUIET, CHIP, CHIP_ON, INPUT_LINE, PAGE_TITLE } from '@/lib/ui-tokens'
import type { RelationEdgeType } from '../types'
import { NodeTypeIcon, NODE_TYPE_LABELS } from './node-type-icon'

const CREATABLE: readonly RelationEdgeType[] = ['character', 'country', 'event']

export function RelationNodeCreateDialog({
  open,
  busy,
  onCreate,
  onClose,
}: {
  open: boolean
  busy: boolean
  onCreate: (type: RelationEdgeType, name: string) => void
  onClose: () => void
}) {
  const [type, setType] = useState<RelationEdgeType>('character')
  const [name, setName] = useState('')

  // 名字只在这一次输入里有效：关掉或建完都清空（类型留着，连续建同类节点更顺手）
  const close = () => {
    setName('')
    onClose()
  }

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    onCreate(type, trimmed)
    setName('')
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) close() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className={PAGE_TITLE}>新建节点</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-1.5">
          {CREATABLE.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setType(option)}
              aria-pressed={type === option}
              className={type === option ? CHIP_ON : `${CHIP} transition-colors hover:text-ink`}
            >
              <NodeTypeIcon type={option} size={12} />
              {NODE_TYPE_LABELS[option]}
            </button>
          ))}
        </div>

        <input
          autoFocus
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submit()
            }
          }}
          placeholder="名称"
          aria-label="名称"
          className={INPUT_LINE}
        />

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={close} disabled={busy} className={BTN_QUIET}>
            取消
          </button>
          <button type="button" onClick={submit} disabled={busy || !name.trim()} className={BTN_PRIMARY}>
            <Check size={14} strokeWidth={2} />
            <span>创建</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
