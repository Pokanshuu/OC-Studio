// ── vault 标记文件 oc-studio.json ───────────────────────────────────────
// 放在 vault 根目录，作用和 Obsidian 的 `.obsidian/` 类似：
// 声明「这个文件夹是 OC Studio vault」，并承载项目级元信息。
//
// 对外来 vault（Obsidian 自己的）**不自动创建**：只有用户显式说
// 「新建 Vault」时才会写它。所以打开一个 Obsidian vault 不会改动它的根目录。

export const MARKER_REL_PATH = 'oc-studio.json'
export const MARKER_APP_ID = 'oc-studio'
export const MARKER_SCHEMA_VERSION = 1

export interface VaultMarker {
  app: string
  schemaVersion: number
  project: {
    worldName: string
    tagline: string
    cover: string
  }
}

export function buildMarkerContent(
  worldName: string,
  tagline = '',
  cover = '',
): string {
  const marker: VaultMarker = {
    app: MARKER_APP_ID,
    schemaVersion: MARKER_SCHEMA_VERSION,
    project: { worldName, tagline, cover },
  }
  return `${JSON.stringify(marker, null, 2)}\n`
}
