# 桌面开发壳：`npm run tauri:dev`
#
# 为什么需要这个包装：部分终端（例如由宿主应用拉起的集成终端）继承的是**启动时**的
# 环境变量快照，看不到后来加进用户 PATH 的 `%USERPROFILE%\.cargo\bin`，
# 于是 `npx tauri dev` 会在第一步就报
#   failed to run 'cargo metadata' ... program not found
# 这里显式补上 Rust 工具链目录，其余环境一律不动。

$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
if (-not (Test-Path (Join-Path $cargoBin 'cargo.exe'))) {
  Write-Error "找不到 cargo：$cargoBin\cargo.exe。请先安装 Rust（https://rustup.rs）"
  exit 1
}

if (($env:PATH -split ';') -notcontains $cargoBin) {
  $env:PATH = "$cargoBin;$env:PATH"
}

Write-Host "cargo: $(& (Join-Path $cargoBin 'cargo.exe') --version)" -ForegroundColor DarkGray
npx tauri dev
exit $LASTEXITCODE
