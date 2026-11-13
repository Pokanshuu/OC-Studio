import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * 单测只跑纯函数：不起 Next、不连 Dexie、不读磁盘。
 *
 * 环境用 happy-dom 而不是 jsdom —— 后面要测粘贴清洗、`DOMParser` 这类
 * 浏览器 API 时不用再换配置；纯函数测试不受影响。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    reporters: 'dot',
  },
})
