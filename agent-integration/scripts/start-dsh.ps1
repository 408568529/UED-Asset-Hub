param(
  [Parameter(Mandatory = $true)]
  [string]$RuntimeDir,
  [Parameter(Mandatory = $true)]
  [string]$DshSourceDir,
  [int]$Port = 3080
)

$ErrorActionPreference = "Stop"
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\\.."))
$runtimePath = [IO.Path]::GetFullPath($RuntimeDir)
$dshSourcePath = [IO.Path]::GetFullPath($DshSourceDir)
$expectedCommit = "47f943859bef60e4160492346772ded9b24f765a"

if ($runtimePath.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "AGENT_RUNTIME_DIR 必须位于 Git 代码目录外。"
}

if (-not (Test-Path (Join-Path $dshSourcePath ".git"))) {
  throw "未找到独立 DSH 源码目录。请先运行 setup-dsh.ps1。"
}

$actualCommit = (git -C $dshSourcePath rev-parse HEAD).Trim()
if ($actualCommit -ne $expectedCommit) {
  throw "DSH 源码版本不符合要求。期望 $expectedCommit，实际 $actualCommit。"
}

$nodeVersion = node --version
if ($LASTEXITCODE -ne 0) { throw "未找到 Node.js。DSH 需要 Node.js 22.19 或更高版本。" }

$version = [Version]($nodeVersion.TrimStart("v"))
if (($version.Major -eq 22 -and $version.Minor -lt 19) -or $version.Major -lt 22) {
  throw "当前 Node.js 为 $nodeVersion。DSH 需要 Node.js 22.19 或更高版本。"
}

New-Item -ItemType Directory -Force -Path $runtimePath, (Join-Path $runtimePath "dsh-home"), (Join-Path $runtimePath "workspaces"), (Join-Path $runtimePath "artifacts"), (Join-Path $runtimePath "logs") | Out-Null
$env:DSH_HOME = Join-Path $runtimePath "dsh-home"
$env:DSH_TELEMETRY_DISABLED = "1"

Write-Host "Starting DeepSeek Harness 0.1.0-rc.5 on 127.0.0.1:$Port"
Write-Host "DSH_HOME: $env:DSH_HOME"
Push-Location $dshSourcePath
try {
  pnpm dsh web --host 127.0.0.1 --port $Port
} finally {
  Pop-Location
}
