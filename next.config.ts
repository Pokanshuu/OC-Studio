import type { NextConfig } from "next";

const projectRoot = process.env.INIT_CWD || process.cwd()

const nextConfig: NextConfig = {
  output: 'export',
  // pnpm 的 node_modules 位于工作区共享 store 时，Turbopack 的自动根目录推断
  // 可能落到 src/app；显式固定到项目根，保证静态导出可复现。
  turbopack: {
    root: projectRoot,
  },
  experimental: {
    // 沙箱/无子进程环境（以及部分 CI）中禁用 webpack 构建 worker，
    // 避免 spawn EPERM；不影响产物。
    webpackBuildWorker: false,
    cpus: 1,
    workerThreads: true,
  },
  typescript: {
    // 类型检查由 `pnpm typecheck` / `tsc --noEmit` 独立执行。
    // 这里关闭 Next 内置的 worker 类型检查，避免在禁用子进程的沙箱中 EPERM。
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
