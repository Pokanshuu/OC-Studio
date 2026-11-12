# 打微软商店（MSIX）包。
#
# Tauri 只出 msi / nsis，微软商店收的是 MSIX，所以这里手工组包：
#   1. `tauri build --no-bundle` 出 `target/release/app.exe`（前端已嵌进二进制）
#   2. 摆一份 AppxManifest.xml + 图标 + resources.pri
#   3. MakeAppx 打成 .msix（再 bundle 成 .msixupload，Partner Center 收这个）
#   4. signtool 签名
#
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/msix.ps1
#   ... -Publisher "CN=<Partner Center 里的 Publisher>" -PackageName "12345Pokanshuu.OCStudio"
#   ... -SkipBuild      # 已经构建过，只重新组包
#   ... -NoSign         # 只出包不签名（自己给 partner center 传未签名件时用）
#
# ⚠️ 提交商店的两个身份值（Partner Center › 产品管理 › 产品标识）：
#   -Publisher     Identity/Publisher = CN=C585EFD6-1C30-48E8-A8B0-2F1DD03460DB
#   -PackageName   Identity/Name      = Pokanshuu.OCStudio
# 已作为默认值。换账号 / 换产品时要改，否则商店报「无效的软件包系列名称 / 发布者名称」：
#   包系列名 = Name + "_" + base32(SHA256(UTF-16LE(Publisher))[0..8])，
#   当前默认值算出来是 Pokanshuu.OCStudio_bhwvq0v85wsey。

param(
  # 这两个值必须与 Partner Center › 产品管理 › 产品标识 完全一致，否则商店报
  # 「无效的软件包系列名称 / 无效的软件包发布者名称」。核对方法：
  #   包系列名 = Identity/Name + "_" + base32(SHA256(UTF-16LE(Identity/Publisher))[0..8])
  #   现在这两项算出来是 Pokanshuu.OCStudio_bhwvq0v85wsey —— 与商店后台一致。
  [string]$Publisher = 'CN=C585EFD6-1C30-48E8-A8B0-2F1DD03460DB',
  [string]$PackageName = 'Pokanshuu.OCStudio',
  [string]$DisplayName = 'OC Studio',
  [string]$PublisherDisplayName = 'Pokanshuu',
  [string]$Version = '',
  [string]$CertThumbprint = '',
  [switch]$SkipBuild,
  [switch]$NoSign,
  [switch]$MakeCert
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

# 取代码签名证书。
#
# 不用 `Get-ChildItem Cert: -CodeSigningCert`：那是 PKI 模块提供的动态参数，
# 在 `powershell -NoProfile` 拉起的会话里不一定注册，会报「找不到参数 CodeSigningCert」。
# 直接按 EKU 过滤（代码签名 OID 1.3.6.1.5.5.7.3.3），Windows PowerShell 5.1 与 7 都能跑。
function Get-CodeSigningCerts {
  Get-ChildItem 'Cert:\CurrentUser\My' -ErrorAction SilentlyContinue | Where-Object {
    if (-not $_.HasPrivateKey) { return $false }
    $eku = @($_.EnhancedKeyUsageList.ObjectId.Value)
    # 带代码签名 EKU，或 EKU 为空（自签证书常见，视作「不限用途」）
    return ($eku -contains '1.3.6.1.5.5.7.3.3') -or ($eku.Count -eq 0)
  }
}

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host "✗ $text" -ForegroundColor Red; exit 1 }

# ── 1. 版本号：MSIX 要四段纯数字（0.20.3-beta → 0.20.3.0）───────────
if ($Version -eq '') {
  $pkg = Get-Content package.json -Raw | ConvertFrom-Json
  $Version = ($pkg.version -split '-')[0]
}
$parts = @($Version -split '\.')
if ($parts.Count -lt 2 -or $parts.Count -gt 4) { Fail "版本号认不出来：$Version" }
while ($parts.Count -lt 4) { $parts += '0' }
$msixVersion = $parts -join '.'
if ($msixVersion -notmatch '^\d+\.\d+\.\d+\.\d+$') { Fail "MSIX 版本号必须是四段纯数字：$msixVersion" }

# ── 2. 找 Windows SDK 里的 MakeAppx / signtool ────────────────────
$sdkRoot = 'C:\Program Files (x86)\Windows Kits\10\bin'
$sdk = Get-ChildItem $sdkRoot -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '^10\.' } |
  Sort-Object { [version]$_.Name } -Descending |
  ForEach-Object { Join-Path $_.FullName 'x64' } |
  Where-Object { Test-Path (Join-Path $_ 'makeappx.exe') } |
  Select-Object -First 1
if (-not $sdk) { Fail "没找到 makeappx.exe（需要 Windows SDK 10 的 x64 工具）" }
$makeappx = Join-Path $sdk 'makeappx.exe'
$signtool = Join-Path $sdk 'signtool.exe'
$makepri = Join-Path $sdk 'makepri.exe'
Write-Host "SDK: $sdk"

# ── 3. 构建（--no-bundle：不出 msi / nsis）────────────────────────
if (-not $SkipBuild) {
  Step 'tauri build --no-bundle'
  npx tauri build --no-bundle
  if ($LASTEXITCODE -ne 0) { Fail "构建失败（exit $LASTEXITCODE）" }
}
$exe = 'src-tauri/target/release/app.exe'
if (-not (Test-Path $exe)) { Fail "没有 $exe，先跑一次构建" }

# ── 4. 摆包 ───────────────────────────────────────────────────
$outDir = 'src-tauri/target/release/msix'
$stage = Join-Path $outDir "staging/$PackageName`_${msixVersion}_x64"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $stage 'Assets') -Force | Out-Null

Step '摆包'
Copy-Item $exe (Join-Path $stage 'app.exe') -Force
foreach ($icon in 'StoreLogo.png', 'Square44x44Logo.png', 'Square150x150Logo.png', 'Square71x71Logo.png', 'Square310x310Logo.png') {
  Copy-Item "src-tauri/icons/$icon" (Join-Path $stage "Assets/$icon") -Force
}
Copy-Item 'src-tauri/icons/icon.ico' (Join-Path $stage 'Assets/icon.ico') -Force

# 宽幅磁贴（310×150）：清单里只要带了 Square310x310Logo，就必须同时给 Wide310x150Logo。
# 仓库里没有这张图，按 icon.png 等比居中生成一张透明底版本。
Add-Type -AssemblyName System.Drawing
$widePng = Join-Path $stage 'Assets/Wide310x150Logo.png'
$srcImage = [System.Drawing.Image]::FromFile((Resolve-Path 'src-tauri/icons/icon.png'))
$canvas = New-Object System.Drawing.Bitmap(310, 150)
$graphics = [System.Drawing.Graphics]::FromImage($canvas)
$graphics.Clear([System.Drawing.Color]::Transparent)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$drawHeight = 120
$drawWidth = [int]($srcImage.Width * ($drawHeight / $srcImage.Height))
$graphics.DrawImage($srcImage, [int]((310 - $drawWidth) / 2), [int]((150 - $drawHeight) / 2), $drawWidth, $drawHeight)
$graphics.Dispose()
$canvas.Save($widePng, [System.Drawing.Imaging.ImageFormat]::Png)
$canvas.Dispose()
$srcImage.Dispose()

$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap rescap">
  <Identity
    Name="$PackageName"
    Publisher="$Publisher"
    Version="$msixVersion"
    ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>$DisplayName</DisplayName>
    <PublisherDisplayName>$PublisherDisplayName</PublisherDisplayName>
    <Logo>Assets\StoreLogo.png</Logo>
    <Description>本地优先的原创角色（OC）与世界观创作工作台</Description>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.22621.0" />
  </Dependencies>
  <Resources>
    <Resource Language="zh-CN" />
  </Resources>
  <Applications>
    <Application Id="OCStudio" Executable="app.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="$DisplayName"
        Description="本地优先的原创角色（OC）与世界观创作工作台"
        BackgroundColor="transparent"
        Square150x150Logo="Assets\Square150x150Logo.png"
        Square44x44Logo="Assets\Square44x44Logo.png">
        <uap:DefaultTile
          Wide310x150Logo="Assets\Wide310x150Logo.png"
          Square71x71Logo="Assets\Square71x71Logo.png"
          Square310x310Logo="Assets\Square310x310Logo.png" />
      </uap:VisualElements>
    </Application>
  </Applications>
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
</Package>
"@
$manifest | Out-File -FilePath (Join-Path $stage 'AppxManifest.xml') -Encoding utf8

# 语言资源索引（商店提交要求包里至少一种语言）
if (Test-Path $makepri) {
  $priconfig = Join-Path $stage 'priconfig.xml'
  & $makepri createconfig /cf $priconfig /dq zh-CN /o | Out-Null
  & $makepri new /pr $stage /cf $priconfig /of (Join-Path $stage 'resources.pri') /in $PackageName /o | Out-Null
  Remove-Item $priconfig -Force
}

# ── 5. 打包 ───────────────────────────────────────────────────
Step 'makeappx pack'
$msix = Join-Path $outDir "$PackageName`_${msixVersion}_x64.msix"
if (Test-Path $msix) { Remove-Item $msix -Force }
& $makeappx pack /d $stage /p $msix /o
if ($LASTEXITCODE -ne 0) { Fail "makeappx pack 失败（exit $LASTEXITCODE）" }

# ── 6. 签名（必须在 bundle 之前：.msixupload 里装的就是这个 .msix）────
if (-not $NoSign) {
  Step '签名'
  # -Publisher 换成 Partner Center 的 Identity/Publisher 以后，本机通常没有对应证书 ——
  # 签名证书的 Subject 必须和清单里的 Publisher 一致，所以这里可以现生成一张自签的
  if ($CertThumbprint -eq '' -and $MakeCert) {
    $match = Get-CodeSigningCerts |
      Where-Object { $_.Subject -eq $Publisher } |
      Sort-Object NotAfter -Descending |
      Select-Object -First 1
    if (-not $match) {
      Write-Host "生成自签代码签名证书：$Publisher" -ForegroundColor Gray
      $match = New-SelfSignedCertificate -Type CodeSigningCert -Subject $Publisher `
        -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddYears(3) `
        -KeyExportPolicy Exportable `
        -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3')
    }
    $CertThumbprint = $match.Thumbprint
  }
  if ($CertThumbprint -eq '') {
    $cert = Get-CodeSigningCerts |
      Where-Object { $_.Subject -eq $Publisher } |
      Sort-Object NotAfter -Descending |
      Select-Object -First 1
    if (-not $cert) {
      $cert = Get-CodeSigningCerts |
        Sort-Object NotAfter -Descending |
        Select-Object -First 1
    }
    if ($cert) { $CertThumbprint = $cert.Thumbprint }
  }
  if ($CertThumbprint -eq '') {
    Write-Host "! 没有代码签名证书，跳过签名（包留着未签名状态）" -ForegroundColor Yellow
  } else {
    & $signtool sign /fd SHA256 /sha1 $CertThumbprint /s My $msix
    if ($LASTEXITCODE -ne 0) { Write-Host "! 签名失败（包本身是好的）" -ForegroundColor Yellow }
    else {
      # 自签证书本机不信任，verify 一定会往 stderr 写一行 —— 别让它把脚本打断
      $previousEap = $ErrorActionPreference
      $ErrorActionPreference = 'SilentlyContinue'
      & $signtool verify /pa $msix *> $null
      $verifyCode = $LASTEXITCODE
      $ErrorActionPreference = $previousEap
      if ($verifyCode -eq 0) { Write-Host "✓ 签名并验证通过" -ForegroundColor Green }
      else { Write-Host "! 已签名，但本机不信任这张自签证书（侧载前要把它装进「受信任人」）" -ForegroundColor Yellow }
    }
  }
}

# ── 7. .msixupload：Partner Center 要的是**只装包文件的 zip**，不是 bundle ──
#
# 踩过一次：先用 `makeappx bundle` 出 .msixupload，商店报
#   「文件 AppxBundleManifest.xml 不支持 / AppxBlockMap.xml 不被支持 / [Content_Types].xml 不被支持」
# 因为 bundle 自带的三个 footprint 文件被当成载荷内容校验了。上传件里只能有包本身。
Step '.msixupload（zip：只装已签名的 .msix）'
$upload = Join-Path $outDir "$PackageName`_${msixVersion}_x64.msixupload"
if (Test-Path $upload) { Remove-Item $upload -Force }
# Compress-Archive 只认 .zip 后缀，先压再改名；包内的条目名就是文件名本身（不带目录）
$zipTmp = Join-Path $outDir 'upload.zip'
if (Test-Path $zipTmp) { Remove-Item $zipTmp -Force }
Compress-Archive -LiteralPath $msix -DestinationPath $zipTmp -CompressionLevel Optimal -Force
Move-Item $zipTmp $upload -Force

# ── 8. 收尾 ───────────────────────────────────────────────────
Remove-Item $stage -Recurse -Force

Step '产物'
Get-ChildItem $outDir | Where-Object { $_.Extension -in '.msix', '.msixupload' } |
  Select-Object Name, @{n = 'MB'; e = { [math]::Round($_.Length / 1MB, 2) } } |
  Format-Table -AutoSize | Out-String -Width 100 | Write-Host

Write-Host @"
提交商店前核对两处（Partner Center › 产品管理 › 产品标识）：
  Identity/Name      = $PackageName
  Identity/Publisher = $Publisher
不一致就重新打：-PackageName "..." -Publisher "CN=..."
侧载测试：先把证书装进「受信任人」，再双击 .msix 或在 PowerShell 里 Add-AppxPackage。
"@ -ForegroundColor Gray
