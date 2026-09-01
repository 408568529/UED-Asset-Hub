param(
  [Parameter(Mandatory = $true)][string]$RootPath
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Windows-native filesystem verification requires Windows.' }
if ($RootPath -notmatch '^[A-Za-z]:\\') { throw 'RootPath must be an absolute local drive path.' }
if ($RootPath.StartsWith('\\') -or $RootPath.StartsWith('\\?\')) { throw 'RootPath must not be UNC or device namespace.' }
$root = (Resolve-Path -LiteralPath $RootPath).Path
$items = Get-ChildItem -LiteralPath $root -Force -Recurse
foreach ($item in $items) {
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Reparse point is not permitted: $($item.FullName)" }
  if (-not $item.PSIsContainer) {
    $streams = @(Get-Item -LiteralPath $item.FullName -Stream * | Where-Object { $_.Stream -ne ':$DATA' })
    if ($streams.Count -ne 0) { throw "Alternate data stream is not permitted: $($item.FullName)" }
    if ($item.LinkType) { throw "Link is not permitted: $($item.FullName)" }
    $hardLinks = @(& fsutil hardlink list $item.FullName 2>$null | Where-Object { $_ -and $_.Trim() })
    if ($LASTEXITCODE -ne 0 -or $hardLinks.Count -ne 1) { throw "Hardlink identity is ambiguous: $($item.FullName)" }
  }
}
[ordered]@{ schemaVersion = 1; root = $root; reparsePoints = 'none'; alternateDataStreams = 'none'; status = 'pass' } | ConvertTo-Json -Compress
