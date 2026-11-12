import type { ImageCategory } from '@/lib/image-refs'

/**
 * 相册抽屉的槽位名 —— **唯一来源**。
 *
 * 为什么单独一份：相册按「图片槽位」分组（`docs/相册.md` §1.1），抽屉名应该跟
 * `docs/模板.md` §4.1 的槽位叫法走，而不是跟各实体的字段名走。以前 `CATEGORY_TREE`
 * 手写文案，于是同一个 `gallery` 槽位在角色里叫「相册图片」、事件里叫「图片」、
 * 国家 / 词条里叫「画廊」—— 同一个 category 贴了三个标签。
 *
 * 只放相册真正会展示的槽位；`animation` / `novelCover` / `map` 不进相册，
 * 由 `scripts/album-check.ts` 显式登记，避免以后新加槽位又悄悄漏一个抽屉。
 */
export type AlbumCategory =
  | 'avatar'
  | 'fullbody'
  | 'header'
  | 'gallery'
  | 'image'
  | 'flag'
  | 'cover'
  | 'body'

export const ALBUM_SLOT_LABELS: Record<AlbumCategory, string> = {
  avatar: '头像',
  fullbody: '立绘',
  header: '封面',
  gallery: '画廊',
  image: '图片',
  flag: '旗帜',
  cover: '封面',
  body: '正文图片',
}

/** 图片槽位（`ImageCategory`）里，相册不建抽屉的那些 —— 自检脚本据此判断覆盖是否完整 */
export const ALBUM_EXCLUDED_CATEGORIES: ReadonlyArray<ImageCategory> = [
  'animation',
  'novelCover',
  'map',
]
