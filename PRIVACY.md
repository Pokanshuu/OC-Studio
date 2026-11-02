# OC Studio 隐私与离线说明

OC Studio 是一个本地优先的原创角色（OC）与世界观创作桌面应用。当前构建的硬约束是：
**运行时完全离线、零上传、零遥测。**

## 运行时网络

- 不请求任何账号、云同步、遥测、崩溃上报、分析埋点或自动更新服务。
- 不加载任何 CDN、外部字体、外部脚本、外部样式表。
- 不调用在线地形、气候、地图瓦片或地理编码 API。
- 世界地图的所有图层（高程、温度、湿度、生物群系、河流、湖泊）在本机 Web Worker 内计算。
- 关系图谱、编辑器、树形表格、JSON/ZIP 备份均在本机完成。
- 原在线 AI 能力已从离线构建中移除；`src/lib/ai/` 仅保留不联网的本地上下文构建工具。

## 内容安全策略（CSP）

Tauri 生产构建的 CSP 以 `default-src 'self'` 为基线，仅允许：

- 本地打包脚本与样式（为兼容 Next.js 静态导出的内联样式/启动脚本，允许 `'unsafe-inline'`；不使用远程来源）。
- 本地图片、`data:`、`blob:` 与 Tauri asset 协议（仅 AppData/images）。
- 本地 IPC（`ipc:` / `http://ipc.localhost`）。
- 开发模式额外允许 `localhost:3000` 与 HMR WebSocket，仅用于开发，不进入生产。

配置位置：`src-tauri/tauri.conf.json` 的 `app.security.csp` / `devCsp`。

## 数据位置

| 数据 | 位置 |
| --- | --- |
| 角色、事件、国家、词条、标签、关系、地图参数/种子 | 本机 IndexedDB（`OCStudioDB`，Dexie 管理） |
| 图片（桌面端） | Tauri `AppData/images/`，选择文件时复制到该目录，不引用外部 URL |
| 图片（浏览器开发预览） | 当前会话的 `blob:`；刷新后不持久，仅用于开发 |
| 导出备份 | 用户主动选择的下载位置；JSON 或 ZIP |

## 导入安全

- 导入 JSON/ZIP 时，会递归清除图片字段中的 `http(s)` URL，只保留 `data:`、`blob:` 与本地相对路径。
- 运行时 `resolveImageUrl()` 也会把远程图片降级为本地占位图，CSP 同时禁止远程 `img-src`。
- ZIP 读取支持 store/deflate；只解析顶层的 `oc-data.json`，不执行压缩包内任何脚本。

## 备份与恢复

- “设置 → 数据”提供 JSON 与 ZIP 两种导出。
- 备份包含：角色、事件、国家、词条、标签、嵌入条目的关系，以及地图的 `seed + params`。
- 地图原始图层不进入备份：相同 seed + 参数可在本机确定性重建相同地图，避免数 MB 的冗余数据。
- 图片二进制目前不进入备份，仍保存在本机数据目录；迁移机器时需同时复制 AppData/images。

## 已知边界

- 浏览器开发预览不是最终交付物；桌面安装包由 Tauri 提供 CSP 与本地文件系统边界。
- `blob:` 图片在浏览器预览中不持久；桌面端使用 AppData 文件。
- 移动端同步不在首期范围；未来如提供，默认关闭，仅手动导入/导出或显式连接自托管服务。
- 无自动更新机制；更新由用户手动安装新版本。

## 审计建议

```bash
# 运行时应无外部网络调用（除本地 blob/asset）
rg "fetch\\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon" src

# 检查构建产物中的外部 URL
rg "https?://" out
```

构建产物中的 `http://` 若出现，通常是 SVG 命名空间、许可证文本或 Tauri asset 协议说明，不应被运行时当作网络请求目标。
