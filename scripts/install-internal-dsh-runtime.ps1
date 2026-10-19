[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ReleaseRoot,
  [Parameter(Mandatory = $true)][string]$ConfigPath,
  [string]$SourceBundlePath,
  [string]$ExpectedSourceBundleSha256
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
$genuiContract = Get-Content -LiteralPath (Join-Path $release 'agent-integration\dsh\genui-plugin.json') -Raw | ConvertFrom-Json
$repository = [string]$releaseVersion.sourceRepository
$commit = [string]$releaseVersion.sourceCommit
if ($repository -ne 'https://github.com/deepseek-ai/deepseek-harness.git' -or $commit -ne 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e') {
  throw 'Release DSH identity is not the approved pinned upstream source.'
}
if ($genuiContract.packageName -ne 'dsh-plugin-genui' -or $genuiContract.version -ne '0.15.1' -or $genuiContract.dshVersion -ne $releaseVersion.version -or $genuiContract.npmIntegrity -notmatch '^sha512-[A-Za-z0-9+/]+=*$' -or $genuiContract.packageTarball -ne 'agent-integration/dsh/packages/dsh-plugin-genui-0.15.1.tgz' -or $genuiContract.packageTarballSha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Release GenUI plugin identity or local package integrity is invalid.' }
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
$pnpmShimRoot = Join-Path $parent '.tools'
$pnpmShim = Join-Path $pnpmShimRoot 'pnpm.cmd'
if (Test-Path -LiteralPath $pnpmShim) { throw 'A pnpm shim already exists in the isolated DSH tools directory.' }
$null = [System.IO.Directory]::CreateDirectory($pnpmShimRoot)
Assert-NoReparseAncestor $pnpmShimRoot
Assert-UedPrivateAcl $pnpmShimRoot
[System.IO.File]::WriteAllText($pnpmShim, "@echo off`r`ncall `"$($corepack.Source)`" pnpm@$pnpmVersion %*`r`nexit /b %ERRORLEVEL%`r`n", [System.Text.Encoding]::ASCII)
$env:Path = $pnpmShimRoot + ';' + $env:Path
$env:COREPACK_HOME = Join-Path $parent '.corepack-cache'
$env:PNPM_STORE_PATH = Join-Path $parent '.pnpm-store'
$env:CI = 'true'
foreach ($name in @('DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'ADMIN_PASSWORD', 'ADMIN_SESSION_SECRET', 'AGENT_GATEWAY_TOKEN', 'RUNTIME_CONTROL_TOKEN', 'NPM_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN', 'DATA_DIR', 'TRAINING_MEDIA_DIR', 'NPM_CONFIG_USERCONFIG', 'NPM_CONFIG_GLOBALCONFIG', 'NPM_CONFIG_CACHE', 'NPM_CONFIG_REGISTRY', 'NPM_CONFIG_ALWAYS_AUTH')) {
  Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
}
$env:NPM_CONFIG_USERCONFIG = Join-Path $parent 'internal-npmrc'
$env:NPM_CONFIG_GLOBALCONFIG = Join-Path $parent 'internal-global-npmrc'
$env:NPM_CONFIG_CACHE = Join-Path $parent 'npm-cache'
$env:NPM_CONFIG_REGISTRY = 'https://registry.npmjs.org/'
$env:NPM_CONFIG_ALWAYS_AUTH = 'false'
[System.IO.File]::WriteAllText($env:NPM_CONFIG_USERCONFIG, "registry=https://registry.npmjs.org/`nalways-auth=false`n", [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($env:NPM_CONFIG_GLOBALCONFIG, '', [System.Text.UTF8Encoding]::new($false))

$useBundle = -not [string]::IsNullOrWhiteSpace($SourceBundlePath)
if ($useBundle -ne (-not [string]::IsNullOrWhiteSpace($ExpectedSourceBundleSha256))) { throw 'SourceBundlePath and ExpectedSourceBundleSha256 must be provided together.' }
if ($useBundle) {
  if ($ExpectedSourceBundleSha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'ExpectedSourceBundleSha256 must be a SHA-256 digest.' }
  Assert-NoReparseAncestor ([System.IO.Path]::GetFullPath($SourceBundlePath))
  $bundleHash = (Get-FileHash -LiteralPath $SourceBundlePath -Algorithm SHA256).Hash
  if ($bundleHash -ne $ExpectedSourceBundleSha256) { throw 'Pinned DSH source bundle SHA-256 mismatch.' }
  # Git requires a repository context even for a self-contained bundle.
  # Use a new verification-only repository, never the user's or Hub's .git.
  $bundleVerificationRoot = Join-Path $parent '.bundle-verification.git'
  if (Test-Path -LiteralPath $bundleVerificationRoot) { throw 'Bundle verification scratch directory already exists.' }
  & git init --bare $bundleVerificationRoot
  if ($LASTEXITCODE -ne 0) { throw 'Unable to create isolated bundle verification context.' }
  & git -C $bundleVerificationRoot bundle verify ([System.IO.Path]::GetFullPath($SourceBundlePath))
  if ($LASTEXITCODE -ne 0) { throw 'Pinned DSH source bundle failed Git verification.' }
}

foreach ($target in @($source, $runtime)) {
  if ($useBundle) { & git clone --no-checkout ([System.IO.Path]::GetFullPath($SourceBundlePath)) $target }
  else { & git clone --no-checkout $repository $target }
  if ($LASTEXITCODE -ne 0) { throw 'Official DSH source clone failed.' }
  & git -C $target config core.symlinks true
  if ($LASTEXITCODE -ne 0) { throw 'Unable to enable symlink-aware checkout for the pinned DSH source.' }
  & git -C $target checkout --detach $commit
  if ($LASTEXITCODE -ne 0) { throw 'Pinned DSH source checkout failed.' }
  $actualCommit = (& git -C $target rev-parse HEAD).Trim()
  if ($actualCommit -ne $commit) { throw 'DSH source commit identity mismatch.' }
  $actualTree = (& git -C $target rev-parse 'HEAD^{tree}').Trim()
  if ($actualTree -ne [string]$releaseVersion.sourceTree) { throw 'DSH source tree identity mismatch.' }
  Push-Location $target
  try {
    $package = Get-Content -LiteralPath (Join-Path $target 'package.json') -Raw | ConvertFrom-Json
    if ($package.packageManager -ne "pnpm@$pnpmVersion" -or $package.version -ne $releaseVersion.version) { throw 'Pinned DSH package manager or package version changed.' }
    $actualPnpmVersion = (& $corepack.Source pnpm --silent --version).Trim()
    if ($LASTEXITCODE -ne 0 -or $actualPnpmVersion -ne $pnpmVersion) { throw 'Corepack did not resolve the DSH-pinned pnpm version.' }
    & $corepack.Source pnpm --store-dir $env:PNPM_STORE_PATH install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'DSH frozen dependency installation failed.' }
    & $corepack.Source pnpm run build
    if ($LASTEXITCODE -ne 0) { throw 'DSH build failed.' }
    if ($target -eq $source) {
      $status = ((& git -C $source status --porcelain=v1) -join "`n").Trim()
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
$dshHome = Join-Path ([System.IO.Path]::GetFullPath([string]$config.AGENT_RUNTIME_DIR)) 'dsh-home'
$null = [System.IO.Directory]::CreateDirectory($dshHome)
Assert-NoReparseAncestor $dshHome
Assert-UedPrivateAcl $dshHome
$pluginTarballSource = Join-Path $release ($genuiContract.packageTarball.Replace('/', '\'))
if (-not (Test-Path -LiteralPath $pluginTarballSource -PathType Leaf)) { throw 'The verified GenUI plugin tarball is missing from this release.' }
Assert-NoReparseAncestor $pluginTarballSource
if ((Get-FileHash -LiteralPath $pluginTarballSource -Algorithm SHA256).Hash -ne $genuiContract.packageTarballSha256) { throw 'The GenUI plugin tarball SHA-256 does not match its release manifest.' }
$pluginTarballCache = Join-Path ([System.IO.Path]::GetFullPath([string]$config.AGENT_RUNTIME_DIR)) 'genui-packages'
$null = [System.IO.Directory]::CreateDirectory($pluginTarballCache)
Assert-NoReparseAncestor $pluginTarballCache
Assert-UedPrivateAcl $pluginTarballCache
$pluginTarball = Join-Path $pluginTarballCache ('dsh-plugin-genui-0.15.1-' + $genuiContract.packageTarballSha256 + '.tgz')
if (Test-Path -LiteralPath $pluginTarball) {
  if (-not (Test-Path -LiteralPath $pluginTarball -PathType Leaf) -or (Get-FileHash -LiteralPath $pluginTarball -Algorithm SHA256).Hash -ne $genuiContract.packageTarballSha256) { throw 'An existing GenUI runtime package cache entry does not match the pinned SHA-256.' }
} else {
  Copy-Item -LiteralPath $pluginTarballSource -Destination $pluginTarball
  Assert-NoReparseAncestor $pluginTarball
  if ((Get-FileHash -LiteralPath $pluginTarball -Algorithm SHA256).Hash -ne $genuiContract.packageTarballSha256) { throw 'The cached GenUI plugin tarball failed SHA-256 verification.' }
}
$env:DSH_HOME = $dshHome
$env:DSH_TELEMETRY_DISABLED = '1'
Push-Location $runtime
try {
  & $node.Source '--import' 'tsx/esm' 'apps/cli/src/bin.ts' 'plugin' '--profile' 'web' 'add' $pluginTarball '--save-exact' '--ignore-scripts' '--store-dir' $env:PNPM_STORE_PATH
  if ($LASTEXITCODE -ne 0) { throw 'The official DSH Plugin Manager could not install the pinned GenUI plugin into the isolated web profile.' }
  $pluginManifestPath = Join-Path $dshHome 'profiles\web\node_modules\dsh-plugin-genui\package.json'
  if (-not (Test-Path -LiteralPath $pluginManifestPath -PathType Leaf)) { throw 'The isolated DSH web profile is missing the installed GenUI package.' }
  $pluginManifest = Get-Content -LiteralPath $pluginManifestPath -Raw | ConvertFrom-Json
  if ($pluginManifest.name -ne $genuiContract.packageName -or $pluginManifest.version -ne $genuiContract.version) { throw 'The installed GenUI package identity does not match the pinned release manifest.' }
  & $node.Source (Join-Path $release 'agent-integration\scripts\genui-client-load-liveness.mjs') $dshHome
  if ($LASTEXITCODE -ne 0) { throw 'The pinned GenUI client compatibility patch failed.' }
  $profileManifest = Get-Content -LiteralPath (Join-Path $dshHome 'profiles\web\package.json') -Raw | ConvertFrom-Json
  $pinnedPluginVersion = $profileManifest.dependencies.PSObject.Properties[$genuiContract.packageName].Value
  if ([string]$pinnedPluginVersion -notmatch 'dsh-plugin-genui-0\.15\.1-[a-fA-F0-9]{64}\.tgz') { throw 'The DSH web profile does not refer to the verified local GenUI package tarball.' }
  $bundles = @($profileManifest.dsh.profile.bundles | Where-Object { $_ -ne $genuiContract.packageName })
  if ($bundles.Count -ne @($profileManifest.dsh.profile.bundles).Count) {
    $profileManifest.dsh.profile.bundles = $bundles
    $profilePath = Join-Path $dshHome 'profiles\web\package.json'
    $profileManifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $profilePath -Encoding utf8NoBOM
  }
  if (@($profileManifest.dsh.profile.bundles) -contains $genuiContract.packageName) { throw 'The GenUI package must remain opt-in through its restricted Agent preset, not load in every DSH session.' }
  if (-not (Select-String -LiteralPath (Join-Path $dshHome 'profiles\web\pnpm-lock.yaml') -SimpleMatch $genuiContract.npmIntegrity -Quiet)) { throw 'The DSH web profile lockfile does not contain the approved GenUI npm integrity.' }
} finally {
  Pop-Location
}
Write-Host 'Pinned DSH source, isolated runtime, and exact GenUI web profile are ready; no Hub or data service was started.'
