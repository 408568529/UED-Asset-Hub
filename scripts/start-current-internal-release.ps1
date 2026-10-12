[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$InstallRoot,
  [Parameter(Mandatory = $true)][string]$ConfigPath,
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Internal-Release.Common.psm1') -Force
$install = [System.IO.Path]::GetFullPath($InstallRoot)
$configFullPath = [System.IO.Path]::GetFullPath($ConfigPath)
$installPrefix = $install.TrimEnd('\') + '\'
if ($configFullPath.StartsWith($installPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Runtime configuration must be outside InstallRoot.' }
$active = Read-UedReleasePointer $install 'active-release.json'
if (-not $active) { throw 'No active internal release is selected.' }
Assert-NoReparseAncestor $active.ReleaseRoot
Assert-UedReleaseTree $active.ReleaseRoot
$manifest = Get-Content -LiteralPath (Join-Path $active.ReleaseRoot 'release-manifest.json') -Raw | ConvertFrom-Json
if ($manifest.releaseVersion -ne $active.Value.releaseVersion -or $manifest.source.commit -ne $active.Value.sourceCommit) { throw 'Active pointer does not match its release manifest.' }

$startScript = Join-Path $active.ReleaseRoot 'scripts\start-internal-release.ps1'
if ($CheckOnly) { & $startScript -ConfigPath $configFullPath -CheckOnly }
else { & $startScript -ConfigPath $configFullPath }
