# 生成移动端界面预览图（手机尺寸 390×844 两屏 + 模型语义树）
# 用法：直接运行本脚本（会自行起/复用本地静态服务）。
$ErrorActionPreference = 'Stop'
$repo    = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # .scratch/apple-music-ui -> 仓库根
$out     = Join-Path $PSScriptRoot 'preview-shell.png'
$edge    = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$profile = Join-Path $env:TEMP 'edge-kumone-shot'

if (-not (Test-Path $edge)) { throw "未找到 Edge：$edge" }

# 服务仓库根目录（预览页与 App 同源，才能读取 iframe 里的 Mobile.snapshot）
$base = 'http://127.0.0.1:8100'
try {
  Invoke-WebRequest -Uri "$base/www/index.html" -TimeoutSec 2 -UseBasicParsing | Out-Null
} catch {
  Start-Process -FilePath 'python' `
    -ArgumentList '-m','http.server','8100','--directory',$repo `
    -WindowStyle Hidden
  Start-Sleep -Seconds 2
}

$harness = "$base/.scratch/apple-music-ui/preview-harness.html"

& $edge --headless=new --disable-gpu --no-first-run --hide-scrollbars `
  --virtual-time-budget=6000 --window-size=1320,960 --user-data-dir=$profile `
  --screenshot="$out" $harness 2>$null | Out-Null

Write-Output "预览图已生成：$out"
