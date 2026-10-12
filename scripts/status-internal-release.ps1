[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$InstallRoot)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Internal-Release.Common.psm1') -Force
$install = [System.IO.Path]::GetFullPath($InstallRoot)
$result = @{}
foreach ($name in @('active-release.json', 'previous-release.json')) {
  $pointer = Read-UedReleasePointer $install $name
  if ($pointer) {
    Assert-NoReparseAncestor $pointer.ReleaseRoot
    Assert-UedReleaseTree $pointer.ReleaseRoot
    $manifest = Get-Content -LiteralPath (Join-Path $pointer.ReleaseRoot 'release-manifest.json') -Raw | ConvertFrom-Json
    $matches = $manifest.releaseVersion -eq $pointer.Value.releaseVersion -and $manifest.source.commit -eq $pointer.Value.sourceCommit
    if (-not $matches) { throw "$name does not match its verified release manifest." }
    $result[$name] = [pscustomobject]@{ releaseVersion = $pointer.Value.releaseVersion; sourceCommit = $pointer.Value.sourceCommit; manifestMatches = $matches }
  } else { $result[$name] = $null }
}
$result | ConvertTo-Json -Depth 4
