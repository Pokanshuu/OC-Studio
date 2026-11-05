'use client'

/**
 * 关系图节点的类型语汇 —— **唯一源**：左上定位结果、左下控制条、图例共用一张表。
 *
 * 图标只是「那一类东西」的标记，不是图例本身：图例的形状（圆 / 卡片）在控制条面板里，
 * 两边讲的是同一件事，不要各画一套。
 */
import { BookOpen, Calendar, Flag, Users } from 'lucide-react'
import type { RelationNodeType } from '../types'

export const NODE_TYPE_LABELS: Record<RelationNodeType, string> = {
  character: '角色',
  event: '事件',
  country: '国家',
  world: '分类',
}

/** 控制条里从左到右的固定顺序（与侧边栏一致：角色 / 事件 / 国家 / 分类） */
export const NODE_TYPE_ORDER: readonly RelationNodeType[] = ['character', 'event', 'country', 'world']

export function NodeTypeIcon({ type, size = 13 }: { type: RelationNodeType; size?: number }) {
  switch (type) {
    case 'character':
      return <Users size={size} strokeWidth={2} />
    case 'event':
      return <Calendar size={size} strokeWidth={2} />
    case 'country':
      return <Flag size={size} strokeWidth={2} />
    case 'world':
      return <BookOpen size={size} strokeWidth={2} />
  }
}
