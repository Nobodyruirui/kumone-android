# 一键试用：起本地服务 + CORS 中继 + 打开试用台
#
#   npm run try
#
# 做三件事：
#   1. 在 8100 端口起一个静态服务（服务仓库根目录，App 与试用台同源）
#   2. 在 8111 端口起 CORS 中继（桌面浏览器直连网易云会被 CORS 拦；
#      安卓 App 走 Capacitor 原生 HTTP 桥，本来就没这问题）
#   3. 用默认浏览器打开试用台 http://127.0.0.1:8100/tools/try.html
#
# 注意：这里**不加** --disable-web-security。
#   CORS 由本地中继解决，所以 Edge / Chrome / ego-lite 都能用。

$ErrorActionPreference = 'Stop'
$repo    = Split-Path -Parent $PSScriptRoot
$base    = 'http://127.0.0.1:8100'
$relay   = 'http://127.0.0.1:8111'

# 1. 静态服务
try {
  Invoke-WebRequest -Uri "$base/tools/try.html" -TimeoutSec 2 -UseBasicParsing | Out-Null
  Write-Output '本地服务已在 8100 运行。'
} catch {
  Start-Process -FilePath 'python' `
    -ArgumentList '-m', 'http.server', '8100', '--directory', $repo `
    -WindowStyle Hidden
  Start-Sleep -Seconds 2
  Write-Output '已启动本地服务（8100）。'
}

# 2. CORS 中继
try {
  Invoke-WebRequest -Uri "$relay/proxy?url=https%3A%2F%2Fmusic.163.com%2F" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop | Out-Null
  Write-Output 'CORS 中继已在 8111 运行。'
} catch {
  $err = $_.Exception.Response.StatusCode.value__
  if ($err -eq 400) {
    Write-Output 'CORS 中继已在 8111 运行。'
  } else {
    Start-Process -FilePath 'node' `
      -ArgumentList (Join-Path $PSScriptRoot 'cors-proxy.mjs') `
      -WindowStyle Hidden
    Start-Sleep -Seconds 2
    Write-Output '已启动 CORS 中继（8111）。'
  }
}

# 3. 打开试用台（用系统默认浏览器）
Write-Output "试用台：$base/tools/try.html"
Start-Process "$base/tools/try.html"
