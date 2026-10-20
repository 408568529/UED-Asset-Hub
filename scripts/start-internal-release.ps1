[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ConfigPath,
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$releaseRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$configFullPath = [System.IO.Path]::GetFullPath($ConfigPath)
$commonModule = Join-Path $releaseRoot 'scripts\Internal-Release.Common.psm1'
Import-Module $commonModule -Force
$rootPrefix = $releaseRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if ($configFullPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Runtime configuration must be stored outside the release code directory.'
}
if (-not (Test-Path -LiteralPath $configFullPath -PathType Leaf)) {
  throw 'Runtime configuration file does not exist.'
}
Assert-NoReparseAncestor $configFullPath
Assert-UedPrivateAcl $configFullPath

$config = Import-PowerShellDataFile -LiteralPath $configFullPath
$allowed = @(
  'MICRO_STANDARD_ROOT', 'DATA_DIR', 'TRAINING_MEDIA_DIR', 'AGENT_RUNTIME_DIR', 'ASSET_HUB_RUNTIME_DIR', 'DSH_SOURCE_DIR', 'DSH_RUNTIME_SOURCE_DIR',
  'HALDUR_DESIGN_SKILL_ROOT', 'HALDUR_DESIGN_SKILL_RUNTIME_ROOT', 'DSH_PORT', 'AGENT_PROXY_PORT',
  'HOST_PORT', 'HOST_INTERNAL_PORT', 'KNOWLEDGE_GATEWAY_MCP_PORT'
)
foreach ($name in $config.Keys) {
  if ($name -notin $allowed) { throw "Unsupported runtime configuration key: $name" }
  [Environment]::SetEnvironmentVariable($name, [string]$config[$name], 'Process')
}

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js 22.19 or newer is required on PATH.' }
$nodeVersion = (& $node.Source --version).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(?<major>\d+)\.(?<minor>\d+)\.' -or [int]$Matches.major -lt 22 -or ([int]$Matches.major -eq 22 -and [int]$Matches.minor -lt 19)) {
  throw 'Node.js 22.19 or newer is required.'
}

Push-Location $releaseRoot
try {
  & $node.Source 'scripts/internal-release-preflight.mjs' $releaseRoot
  if ($LASTEXITCODE -ne 0) { throw 'Runtime path preflight failed; Hub and Agent were not started.' }
  if (-not $CheckOnly) {
    & $node.Source 'scripts/start-host.mjs'
    if ($LASTEXITCODE -ne 0) { throw 'Host Supervisor exited with an error.' }
  }
} finally {
  Pop-Location
}
