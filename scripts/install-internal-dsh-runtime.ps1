[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ReleaseRoot,
  [Parameter(Mandatory = $true)][string]$ConfigPath
)

$ErrorActionPreference = 'Stop'
$release = [System.IO.Path]::GetFullPath($ReleaseRoot)
$config = Import-PowerShellDataFile -LiteralPath ([System.IO.Path]::GetFullPath($ConfigPath))
foreach ($name in @('DATA_DIR', 'TRAINING_MEDIA_DIR', 'AGENT_RUNTIME_DIR', 'ASSET_HUB_RUNTIME_DIR', 'DSH_SOURCE_DIR', 'DSH_RUNTIME_SOURCE_DIR')) {
  if (-not [System.IO.Path]::IsPathRooted([string]$config[$name])) { throw "Runtime configuration must provide an absolute path for $name." }
}
$source = [System.IO.Path]::GetFullPath([string]$config.DSH_SOURCE_DIR)
$runtime = [System.IO.Path]::GetFullPath([string]$config.DSH_RUNTIME_SOURCE_DIR)
$roots = @(
  $release,
  [System.IO.Path]::GetFullPath([string]$config.DATA_DIR),
  [System.IO.Path]::GetFullPath([string]$config.TRAINING_MEDIA_DIR),
  [System.IO.Path]::GetFullPath([string]$config.AGENT_RUNTIME_DIR),
  [System.IO.Path]::GetFullPath([string]$config.ASSET_HUB_RUNTIME_DIR)
)

function Test-Overlap([string]$Left, [string]$Right) {
  $a = $Left.TrimEnd('\') + '\'
  $b = $Right.TrimEnd('\') + '\'
  return $a.Equals($b, [System.StringComparison]::OrdinalIgnoreCase) -or $a.StartsWith($b, [System.StringComparison]::OrdinalIgnoreCase) -or $b.StartsWith($a, [System.StringComparison]::OrdinalIgnoreCase)
}

foreach ($candidate in @($source, $runtime)) {
  if (Test-Path -LiteralPath $candidate) { throw 'DSH source target already exists; refusing to reuse or overwrite it.' }
  foreach ($protected in $roots) {
    if (Test-Overlap $candidate $protected) { throw 'DSH source roots must be separate from release code and configured data/runtime roots.' }
  }
}
if (Test-Overlap $source $runtime) { throw 'DSH authority and runtime source must be separate.' }

$releaseVersion = Get-Content -LiteralPath (Join-Path $release 'agent-integration\dsh\version.json') -Raw | ConvertFrom-Json
$repository = [string]$releaseVersion.sourceRepository
$commit = [string]$releaseVersion.sourceCommit
if ($repository -ne 'https://github.com/deepseek-ai/deepseek-harness.git' -or $commit -ne 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e') {
  throw 'Release DSH identity is not the approved pinned upstream source.'
}
$env:COREPACK_DEFAULT_TO_LATEST = '0'
$pnpmVersion = '11.7.0'

$parent = Split-Path -Parent $source
if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw 'DSH source parent directory must already exist.' }
Import-Module (Join-Path $release 'scripts\Internal-Release.Common.psm1') -Force
Assert-NoReparseAncestor ([System.IO.Path]::GetFullPath($ConfigPath))
Assert-UedPrivateAcl ([System.IO.Path]::GetFullPath($ConfigPath))
$configPrefix = $release.TrimEnd('\') + '\'
if ([System.IO.Path]::GetFullPath($ConfigPath).StartsWith($configPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Runtime configuration must be outside the release code directory.' }
Assert-NoReparseAncestor $parent
if ((Split-Path -Parent $runtime) -ne (Split-Path -Parent $source)) { throw 'DSH authority and runtime sources must be created under one isolated parent.' }

$corepack = Get-Command corepack.cmd -ErrorAction SilentlyContinue
if (-not $corepack) { throw 'Corepack is required to install the pinned DSH runtime dependencies.' }
$env:COREPACK_HOME = Join-Path $parent '.corepack-cache'
$env:PNPM_STORE_PATH = Join-Path $parent '.pnpm-store'
foreach ($name in @('DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'ADMIN_PASSWORD', 'ADMIN_SESSION_SECRET', 'AGENT_GATEWAY_TOKEN', 'RUNTIME_CONTROL_TOKEN', 'NPM_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN', 'DATA_DIR', 'TRAINING_MEDIA_DIR')) {
  Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
}

foreach ($target in @($source, $runtime)) {
  & git clone --no-checkout $repository $target
  if ($LASTEXITCODE -ne 0) { throw 'Official DSH source clone failed.' }
  & git -C $target checkout --detach $commit
  if ($LASTEXITCODE -ne 0) { throw 'Pinned DSH source checkout failed.' }
  $actualCommit = (& git -C $target rev-parse HEAD).Trim()
  if ($actualCommit -ne $commit) { throw 'DSH source commit identity mismatch.' }
  Push-Location $target
  try {
    $package = Get-Content -LiteralPath (Join-Path $target 'package.json') -Raw | ConvertFrom-Json
    if ($package.packageManager -ne "pnpm@$pnpmVersion" -or $package.version -ne $releaseVersion.version) { throw 'Pinned DSH package manager or package version changed.' }
    $actualPnpmVersion = (& $corepack.Source pnpm --silent --version).Trim()
    if ($LASTEXITCODE -ne 0 -or $actualPnpmVersion -ne $pnpmVersion) { throw 'Corepack did not resolve the DSH-pinned pnpm version.' }
    & $corepack.Source pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'DSH frozen dependency installation failed.' }
    & $corepack.Source pnpm build
    if ($LASTEXITCODE -ne 0) { throw 'DSH build failed.' }
    if ($target -eq $source) {
      $status = (& git -C $source status --porcelain=v1).Trim()
      if ($status) { throw 'DSH build changed tracked source files.' }
    }
    foreach ($requiredFile in @('LICENSE', 'THIRD_PARTY_NOTICES.md')) {
      if (-not (Test-Path -LiteralPath (Join-Path $target $requiredFile) -PathType Leaf)) { throw "Pinned DSH checkout is missing required license file: $requiredFile." }
    }
  } finally {
    Pop-Location
  }
  if ($target -eq $runtime) { Remove-Item -LiteralPath (Join-Path $runtime '.git') -Recurse -Force }
}

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js is required to verify the DSH runtime source.' }
Push-Location $release
try {
  & $node.Source 'scripts/verify-dsh-runtime-source.mjs' $source $runtime
  if ($LASTEXITCODE -ne 0) { throw 'DSH runtime source does not match its authoritative checkout.' }
} finally {
  Pop-Location
}
Write-Host 'Pinned DSH source and isolated runtime are ready; no Hub or data service was started.'
