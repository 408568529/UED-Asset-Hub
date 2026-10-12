[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ZipPath,
  [Parameter(Mandatory = $true)][string]$ExpectedSha256,
  [Parameter(Mandatory = $true)][string]$InstallRoot,
  [Parameter(Mandatory = $true)][string]$ConfigPath
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Internal-Release.Common.psm1') -Force

if ($ExpectedSha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'ExpectedSha256 must be a SHA-256 digest.' }
$verified = Get-UedArchiveManifest -ZipPath $ZipPath -ExpectedSha256 $ExpectedSha256
$manifest = $verified.Manifest
$install = [System.IO.Path]::GetFullPath($InstallRoot)
Assert-NoReparseAncestor $install
$configPath = [System.IO.Path]::GetFullPath($ConfigPath)
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) { throw 'Place the externally protected internal-runtime-config.psd1 beside the ZIP before installation.' }
Assert-NoReparseAncestor $configPath
Assert-UedPrivateAcl $configPath
$installPrefix = $install.TrimEnd('\') + '\'
if ($configPath.StartsWith($installPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Runtime configuration must be outside InstallRoot.' }
$config = Import-PowerShellDataFile -LiteralPath $configPath
$protectedNames = @('DATA_DIR', 'TRAINING_MEDIA_DIR', 'AGENT_RUNTIME_DIR', 'ASSET_HUB_RUNTIME_DIR', 'DSH_SOURCE_DIR', 'DSH_RUNTIME_SOURCE_DIR', 'HALDUR_DESIGN_SKILL_ROOT', 'HALDUR_DESIGN_SKILL_RUNTIME_ROOT')
$configuredRoots = @{}
foreach ($name in $protectedNames) {
  $value = [string]$config[$name]
  if (-not $value -and $name -notin @('HALDUR_DESIGN_SKILL_ROOT', 'HALDUR_DESIGN_SKILL_RUNTIME_ROOT')) { throw "Runtime configuration is missing $name." }
  if (-not $value) { continue }
  if (-not [System.IO.Path]::IsPathRooted($value)) { throw "Runtime configuration values must be absolute paths: $name." }
  $configured = [System.IO.Path]::GetFullPath($value).TrimEnd('\') + '\'
  $code = $install.TrimEnd('\') + '\'
  if ($configured.StartsWith($code, [System.StringComparison]::OrdinalIgnoreCase) -or $code.StartsWith($configured, [System.StringComparison]::OrdinalIgnoreCase)) { throw "InstallRoot must be separate from $name." }
  foreach ($existing in $configuredRoots.GetEnumerator()) {
    if ($configured.StartsWith($existing.Value, [System.StringComparison]::OrdinalIgnoreCase) -or $existing.Value.StartsWith($configured, [System.StringComparison]::OrdinalIgnoreCase)) { throw "$name must be separate from $($existing.Key)." }
  }
  $configuredRoots[$name] = $configured
}
if ([bool]$config.HALDUR_DESIGN_SKILL_ROOT -ne [bool]$config.HALDUR_DESIGN_SKILL_RUNTIME_ROOT) { throw 'Haldur source and runtime paths must be configured together.' }

$releaseName = '{0}-{1}' -f $manifest.releaseVersion, $manifest.source.commit.Substring(0, 12)
if ($releaseName -notmatch '^internal-[a-z0-9.-]{1,80}-[a-f0-9]{12}$') { throw 'Manifest release directory name is unsafe.' }
$releasesRoot = Join-Path $install 'releases'
$destination = Join-Path $releasesRoot $releaseName
if (Test-Path -LiteralPath $destination) { throw 'Release version already exists; installation will not overwrite it.' }
$null = [System.IO.Directory]::CreateDirectory($install)
Assert-UedPrivateAcl $install
$null = [System.IO.Directory]::CreateDirectory($releasesRoot)
Assert-NoReparseAncestor $releasesRoot
Expand-UedInternalArchive -ZipPath $ZipPath -Destination $destination | Out-Null

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js is required to verify the installed release.' }
Push-Location $destination
try {
  & $node.Source 'scripts/internal-release-contract.mjs' verify --root $destination
  if ($LASTEXITCODE -ne 0) { throw 'Installed release tree failed manifest verification.' }
} finally { Pop-Location }
Write-Output ([pscustomobject]@{ result = 'INSTALLED'; releaseVersion = $manifest.releaseVersion; releaseDirectory = $destination; zipSha256 = $verified.ZipSha256 } | ConvertTo-Json -Compress)
