import pkg from '../../package.json'

// 版本号单一来源：package.json。
// 发布时只改 package.json 的 version 字段，UI 与文档（AGENTS.md / README / PRD skill）随之同步。
export const APP_VERSION: string = pkg.version
