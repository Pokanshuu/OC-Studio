/**
 * `.ocmap` 的磁盘侧：读底图字节 → 组装档案；选文件 → 建地图 → 落图 → 写标注。
 *
 * 纯解析 / 序列化在 `archive.ts`（脚本可测）；这里只做「碰 IO 的那一步」，
 * 所以全部依赖注入式的现有入口（`saveMapImage` / `createMap` / `saveBlobAs`），
 * 不直接碰 Dexie 或 Tauri 命令。
 */
import { parseAnnotations, stringifyAnnotations } from './annotations'
import {
  archiveFileName,
  archiveImageToBlob,
  blobToArchiveImage,
  parseMapArchive,
  scaleAnnotations,
  serializeMapArchive,
  type MapArchive,
} from './archive'
import { readMapImageBlob, saveMapImage } from './assets'
import { saveBlobAs } from './export'
import { createMap, listMaps, setMapAnnotations, setMapBackground, type MapEntity } from './services'

export interface MapArchiveImportResult {
  id: number
  /** 实际落库的名字（重名会被去重成「名字 2」） */
  name: string
  warnings: string[]
}

function parsedParams(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined
  try {
    const value: unknown = JSON.parse(raw)
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

/** 把一张地图导出成 `.ocmap`。用户取消保存返回 `null`。 */
export async function exportMapArchive(map: MapEntity): Promise<string | null> {
  const image = map.image !== undefined && map.image !== '' ? await blobToArchiveImage(await readMapImageBlob(map.image)) : undefined
  const params = parsedParams(map.params)
  const archive: MapArchive = {
    name: map.name,
    ...(map.seed !== undefined ? { seed: map.seed } : {}),
    ...(params ? { params } : {}),
    ...(map.mode ? { view: map.mode } : {}),
    ...(map.width !== undefined ? { width: map.width } : {}),
    ...(map.height !== undefined ? { height: map.height } : {}),
    annotations: parseAnnotations(map.annotations),
    ...(image ? { image } : {}),
  }
  const text = serializeMapArchive(archive)
  const blob = new Blob([text], { type: 'application/json' })
  return saveBlobAs(blob, archiveFileName(map.name), { filterName: '地图档案' })
}

/**
 * 导入 `.ocmap`。
 *
 * 顺序有讲究：**先建笔记拿到最终名字**，再按这个名字给底图取名 —— 重名地图会自动
 * 去重成「地图 2」，如果先按档案里的名字存图，两张图的文件就会撞在一起。
 */
export async function importMapArchiveFile(file: File): Promise<MapArchiveImportResult> {
  const text = await file.text()
  const { archive, coordinateSpace, warnings } = parseMapArchive(text)

  const id = await createMap(archive.name)
  const created = (await listMaps()).find((item) => item.id === id)
  const name = created?.name ?? archive.name

  let imageSize: { width: number; height: number } | null = null
  if (archive.image) {
    const saved = await saveMapImage(archiveImageToBlob(archive.image), { name })
    imageSize = { width: saved.width, height: saved.height }
    await setMapBackground(
      id,
      saved.relPath,
      imageSize,
      archive.seed !== undefined && archive.params
        ? { seed: archive.seed, params: archive.params, view: archive.view }
        : undefined,
    )
  }

  if (archive.annotations.length > 0) {
    let items = archive.annotations
    if (coordinateSpace === 'pixel') {
      const width = imageSize?.width ?? archive.width ?? 0
      const height = imageSize?.height ?? archive.height ?? 0
      if (width > 0 && height > 0) {
        items = scaleAnnotations(items, width, height)
      } else {
        // 尺寸未知时不猜：线留在像素坐标里会被夹到画布右下角，比丢掉更误导
        warnings.push('档案没有图片尺寸，标注坐标未换算，已跳过')
        items = []
      }
    }
    if (items.length > 0) await setMapAnnotations(id, stringifyAnnotations(items))
  }

  return { id, name, warnings }
}
