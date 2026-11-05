# 桌面开发壳：`npm run tauri:dev`
#
# 为什么需要这个包装：
# 1. 部分终端（例如由宿主应用拉起的集成终端）继承的是**启动时**的环境变量快照，
#    看不到后来加进用户 PATH 的 `%USERPROFILE%\.cargo\bin`，于是 `npx tauri dev`
#    第一步就报 `failed to run 'cargo metadata' ... program not found`。
# 2. 起之前先打印 WebView2 的事实（运行时版本 / 已有实例 / 用户数据目录锁）。
# 3. 闪退排查：把整段输出同时写进 `logs/tauri-dev.log`，控制台一闪而过也不丢证据。
#
# ── 关于 `HRESULT(0x800700AA) 请求的资源在使用中` ─────────────────────────
# 这条错误的字面意思就是 **ERROR_BUSY：资源被占用**。它来自 WebView2 起浏览器进程
# 那一步，最常见的是用户数据目录 `%LOCALAPPDATA%\<identifier>\EBWebView` 被**另一个
# 还活着的实例**（或崩溃后没退干净的 `msedgewebview2.exe`）占着。
#
# 以前这里记的是「WebView2 156 在这台机器上一启动就崩（msedge.dll / 0x80000003）」，
# 并据此怀疑运行时版本。**那个结论不成立**：2026-11-05 复测，不加任何环境变量、
# 同一份 156 运行时下应用能正常起窗口并渲染。0x800700AA 当时被读成了运行时坏掉，
# 其实它在说"忙"。所以现在的做法是**把事实打出来**，不猜、也不擅自改环境变量。

$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
if (-not (Test-Path (Join-Path $cargoBin 'cargo.exe'))) {
  Write-Error "找不到 cargo：$cargoBin\cargo.exe。请先安装 Rust（https://rustup.rs）"
  exit 1
}

if (($env:PATH -split ';') -notcontains $cargoBin) {
  $env:PATH = "$cargoBin;$env:PATH"
}

# ── 预检：只打印，不动任何东西 ────────────────────────────────────────────
$runtimeRoot = 'C:\Program Files (x86)\Microsoft\EdgeWebView\Application'
if (Test-Path $runtimeRoot) {
  $versions = Get-ChildItem $runtimeRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'msedgewebview2.exe') } |
    Select-Object -ExpandProperty Name
  Write-Host "WebView2 运行时：$($versions -join ' / ')" -ForegroundColor DarkGray
}

$live = Get-Process msedgewebview2 -ErrorAction SilentlyContinue
Write-Host "WebView2 浏览器进程：$(if ($live) { "$($live.Count) 个在跑" } else { '无' })" -ForegroundColor DarkGray

$identifiers = @('com.ocstudio.ocstudio')
foreach ($id in $identifiers) {
  $lock = Join-Path $env:LOCALAPPDATA "$id\EBWebView\lockfile"
  if (Test-Path $lock) {
    Write-Host "用户数据目录锁：$lock" -ForegroundColor DarkGray
  }
}

$instances = Get-CimInstance Win32_Process -Filter "Name='app.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.ExecutablePath -like "$PSScriptRoot\..\src-tauri\target\*" }
if ($instances) {
  $pids = ($instances | Select-Object -ExpandProperty ProcessId) -join ', '
  Write-Host "已有 OC Studio 实例在跑：PID $pids" -ForegroundColor Yellow
  Write-Host "如果新窗口起来是空的、报 0x800700AA，先把上面这些窗口关掉再试。" -ForegroundColor Yellow
}

$logDir = Join-Path $PSScriptRoot '..\logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$logPath = Join-Path $logDir 'tauri-dev.log'
"===== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') =====" | Set-Content -Encoding utf8 $logPath

Write-Host "cargo: $(& (Join-Path $cargoBin 'cargo.exe') --version)" -ForegroundColor DarkGray
Write-Host "日志：$logPath" -ForegroundColor DarkGray

npx tauri dev 2>&1 | Tee-Object -FilePath $logPath -Append
exit $LASTEXITCODE
