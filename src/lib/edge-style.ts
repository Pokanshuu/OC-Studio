/**
 * 关系图边型（docs/关系图.md §2）—— **唯一源**。
 *
 * 两种线型是**展示偏好**，存应用设置（`settings.edgeStyle`），不落实体：
 * - `orthogonal`（默认）：四向落点折线
 * - `curve`：从节点形状边缘发散的贝塞尔
 *
 * 几何在 `features/relations/components/floating-edge.ts`，画布与 PNG 导出共用。
 */
export type EdgeStyle = 'orthogonal' | 'curve'

export const EDGE_STYLE_OPTIONS: ReadonlyArray<{ value: EdgeStyle; label: string }> = [
  { value: 'orthogonal', label: '正交' },
  { value: 'curve', label: '曲线' },
] as const

/** 收敛非法值（手改 localStorage / 旧版本数据）：不认识的一律回默认的正交 */
export function normalizeEdgeStyle(value: unknown): EdgeStyle {
  return value === 'curve' ? 'curve' : 'orthogonal'
}
