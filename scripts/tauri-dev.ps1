# 桌面开发壳：`npm run tauri:dev`
#
# 为什么需要这个包装：
# 1. 部分终端（例如由宿主应用拉起的集成终端）继承的是**启动时**的环境变量快照，
#    看不到后来加进用户 PATH 的 `%USERPROFILE%\.cargo\bin`，于是 `npx tauri dev`
#    第一步就报 `failed to run 'cargo metadata' ... program not found`。
# 2. **WebView2 排障背景**：这台机器上 WebView2 `156.0.4314.58` 一启动就让
#    `msedgewebview2.exe` 崩掉（msedge.dll，0x80000003），Tauri 侧表现为
#    `failed to create webview: HRESULT(0x800700AA) 请求的资源在使用中`。
#    注意：直接把 `WEBVIEW2_BROWSER_EXECUTABLE_FOLDER` 指向 Evergreen 的版本目录
#    没用——那个变量只认 Fixed Version 运行时，指错了会弹
#    "Could not find the WebView2 Runtime"。
# 3. 闪退排查：把整段输出同时写进 `logs/tauri-dev.log`，控制台一闪而过也不丢证据。

$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
if (-not (Test-Path (Join-Path $cargoBin 'cargo.exe'))) {
  Write-Error "找不到 cargo：$cargoBin\cargo.exe。请先安装 Rust（https://rustup.rs）"
  exit 1
}

if (($env:PATH -split ';') -notcontains $cargoBin) {
  $env:PATH = "$cargoBin;$env:PATH"
}

$logDir = Join-Path $PSScriptRoot '..\logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$logPath = Join-Path $logDir 'tauri-dev.log'
"===== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') =====" | Set-Content -Encoding utf8 $logPath

Write-Host "cargo: $(& (Join-Path $cargoBin 'cargo.exe') --version)" -ForegroundColor DarkGray
Write-Host "日志：$logPath" -ForegroundColor DarkGray

npx tauri dev 2>&1 | Tee-Object -FilePath $logPath -Append
exit $LASTEXITCODE
