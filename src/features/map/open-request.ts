'use client'

/**
 * 「打开这张地图」的一次性交棒。
 *
 * 地图不是实体，`useEntityNavigate` 那套（按 id 打开某个编辑器）接不了它；
 * 而工具页造完图之后要跳到「地图」并**指着刚建的那张**，不能只切分区 ——
 * MapView 是常驻挂载的，切过去还停在它自己的 `activeId` 上。
 *
 * 所以：调用方先 `requestOpenMap(id)` 再切分区，MapView 在「地图」分区被激活时
 * `consumeOpenMapRequest()` 一次，拿到就读它。不落盘、不跨会话。
 */
let pendingId: number | null = null

export function requestOpenMap(id: number): void {
  pendingId = id
}

/** 取出并清掉请求；没有就返回 null */
export function consumeOpenMapRequest(): number | null {
  const id = pendingId
  pendingId = null
  return id
}
