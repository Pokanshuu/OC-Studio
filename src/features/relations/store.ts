'use client'

import { create } from 'zustand'

const EDGE_CONTROLS_KEY = 'oc-studio-relation-edge-controls'

export interface EdgeControls {
  /** 第一个控制点：沿线位置 0..1 */
  u1: number
  /** 第一个控制点：相对连线的法向偏移 */
  v1: number
  /** 第二个控制点：沿线位置 0..1 */
  u2: number
  /** 第二个控制点：相对连线的法向偏移 */
  v2: number
}

function loadEdgeControls(): Record<string, EdgeControls> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(EDGE_CONTROLS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, EdgeControls>) : {}
  } catch {
    return {}
  }
}

function saveEdgeControls(controls: Record<string, EdgeControls>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(EDGE_CONTROLS_KEY, JSON.stringify(controls))
  } catch {
    // ignore quota errors
  }
}

interface RelationUiState {
  showCharacters: boolean
  showEvents: boolean
  showCountries: boolean
  edgeStyle: 'bezier' | 'straight'
  edgeControls: Record<string, EdgeControls>
  setEdgeControl: (id: string, controls: EdgeControls) => void
  setShowCharacters: (visible: boolean) => void
  setShowEvents: (visible: boolean) => void
  setShowCountries: (visible: boolean) => void
  setEdgeStyle: (style: 'bezier' | 'straight') => void
}

/**
 * 关系图的跨面板 UI 状态。数据本身仍以 Dexie relations 为唯一真相源；
 * Zustand 只负责筛选/可见性，切换页面后不会丢失。
 */
export const useRelationUiStore = create<RelationUiState>((set) => ({
  showCharacters: true,
  showEvents: true,
  showCountries: true,
  edgeStyle: 'bezier',
  edgeControls: loadEdgeControls(),
  setEdgeControl: (id, controls) =>
    set((state) => {
      const edgeControls = { ...state.edgeControls, [id]: controls }
      saveEdgeControls(edgeControls)
      return { edgeControls }
    }),
  setShowCharacters: (showCharacters) => set({ showCharacters }),
  setShowEvents: (showEvents) => set({ showEvents }),
  setShowCountries: (showCountries) => set({ showCountries }),
  setEdgeStyle: (edgeStyle) => set({ edgeStyle }),
}))
