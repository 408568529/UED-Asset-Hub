[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$InstallRoot,
  [Parameter(Mandatory = $true)][string]$ReleaseVersion,
  [Parameter(Mandatory = $true)][string]$ConfigPath
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Internal-Release.Common.psm1') -Force
$install = [System.IO.Path]::GetFullPath($InstallRoot)
Assert-NoReparseAncestor $install
$releasesRoot = Join-Path $install 'releases'
if (-not (Test-Path -LiteralPath $releasesRoot -PathType Container)) { throw 'InstallRoot has no installed releases.' }
$matches = @()
foreach ($directory in Get-ChildItem -LiteralPath $releasesRoot -Directory) {
  Assert-NoReparseAncestor $directory.FullName
  $manifestPath = Join-Path $directory.FullName 'release-manifest.json'
  if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
    Assert-NoReparseAncestor $manifestPath
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.releaseVersion -eq $ReleaseVersion) { $matches += ,([pscustomobject]@{ Root = $directory.FullName; Manifest = $manifest }) }
  }
}
if ($matches.Count -ne 1) { throw 'ReleaseVersion must identify exactly one installed release.' }
$candidate = $matches[0]
if (-not $candidate.Manifest.source.commit.StartsWith($candidate.Manifest.releaseVersion.Split('-')[-1], [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Installed release directory identity does not match its manifest.' }
Assert-UedReleaseTree $candidate.Root
$configFullPath = [System.IO.Path]::GetFullPath($ConfigPath)
Assert-NoReparseAncestor $configFullPath
Assert-UedPrivateAcl $configFullPath
$installPrefix = $install.TrimEnd('\') + '\'
if ($configFullPath.StartsWith($installPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Runtime configuration must be outside InstallRoot.' }
Invoke-UedRuntimePreflight $candidate.Root $configFullPath

$active = Read-UedReleasePointer $install 'active-release.json'
if ($active) {
  Assert-UedReleaseTree $active.ReleaseRoot
  $activeManifest = Get-Content -LiteralPath (Join-Path $active.ReleaseRoot 'release-manifest.json') -Raw | ConvertFrom-Json
  if ($activeManifest.releaseVersion -ne $active.Value.releaseVersion -or $activeManifest.source.commit -ne $active.Value.sourceCommit) { throw 'Current release pointer does not match its verified manifest.' }
}
$next = [pscustomobject]@{
  schemaVersion = 1
  releaseVersion = $candidate.Manifest.releaseVersion
  sourceCommit = $candidate.Manifest.source.commit
  directory = 'releases/' + (Split-Path -Leaf $candidate.Root)
}
if ($active -and $active.Value.releaseVersion -ne $next.releaseVersion) {
  Write-UedReleasePointer $install 'previous-release.json' $active.Value
}
Write-UedReleasePointer $install 'active-release.json' $next
Write-Output ([pscustomobject]@{ result = 'ACTIVATED'; releaseVersion = $next.releaseVersion; sourceCommit = $next.sourceCommit } | ConvertTo-Json -Compress)
