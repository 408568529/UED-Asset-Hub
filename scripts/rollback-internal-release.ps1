[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$InstallRoot,
  [Parameter(Mandatory = $true)][string]$ConfigPath
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Internal-Release.Common.psm1') -Force
$install = [System.IO.Path]::GetFullPath($InstallRoot)
$previous = Read-UedReleasePointer $install 'previous-release.json'
if (-not $previous) { throw 'No verified previous release is recorded.' }
Assert-NoReparseAncestor $previous.ReleaseRoot
Assert-UedReleaseTree $previous.ReleaseRoot
$manifestPath = Join-Path $previous.ReleaseRoot 'release-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.releaseVersion -ne $previous.Value.releaseVersion -or $manifest.source.commit -ne $previous.Value.sourceCommit) { throw 'Previous release pointer does not match its manifest.' }
& (Join-Path $PSScriptRoot 'activate-internal-release.ps1') -InstallRoot $install -ReleaseVersion $manifest.releaseVersion -ConfigPath $ConfigPath
