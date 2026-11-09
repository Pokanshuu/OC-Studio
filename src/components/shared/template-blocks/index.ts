/**
 * 模板组件块 —— 一个有数据的区块，由实体编辑器与笔记编辑器共用。
 *
 * 这些组件**不碰数据库**：值从 props 来、改动走回调。宿主（事件表单 / 词条块 /
 * 分类条目）各自决定写哪一列。模板渲染循环只认组件 id，不认识实体类型。
 */
export { SummaryBlock } from './SummaryBlock'
export { GalleryBlock } from './GalleryBlock'
export { ImageBlock } from './ImageBlock'
export { AvatarBlock } from './AvatarBlock'
export { AnimationBlock } from './AnimationBlock'
