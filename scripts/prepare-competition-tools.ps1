[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitOperatingSystem) { throw 'Windows x64 is required.' }
Import-Module (Join-Path $PSScriptRoot 'Internal-Release.Common.psm1') -Force
$target = [IO.Path]::GetFullPath($Destination)
if ([IO.Path]::GetPathRoot($target).TrimEnd('\') -ieq $env:SystemDrive) { throw 'Choose a tool destination outside the system drive.' }
Assert-NoReparseAncestor $target
if (Test-Path -LiteralPath $target) { throw 'Tool destination must be new; existing tools are never overwritten.' }
$contract = Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\service\windows\competition-tools.json') -Raw | ConvertFrom-Json
$null = [IO.Directory]::CreateDirectory($target)
Add-Type -AssemblyName System.IO.Compression.FileSystem
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
foreach ($name in @('node','git')) {
  $item = $contract.$name
  $archive = Join-Path $target ($name + '.zip')
  Invoke-WebRequest -UseBasicParsing -Uri $item.url -OutFile $archive
  if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.archiveSha256) { throw 'Pinned tool archive checksum mismatch. Preparation stopped; retain the isolated directory for diagnosis.' }
  [IO.Compression.ZipFile]::ExtractToDirectory($archive, (Join-Path $target $name))
}
$nodeRoot = Join-Path $target 'node\node-v22.23.2-win-x64'
$node = Join-Path $nodeRoot 'node.exe'
$git = Join-Path $target 'git\cmd\git.exe'
if ((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash.ToLowerInvariant() -ne $contract.node.executableSha256) { throw 'Pinned Node executable checksum mismatch.' }
if ((& $node --version).Trim() -ne 'v22.23.2' -or (& $node -p 'process.platform').Trim() -ne 'win32' -or (& $node -p 'process.arch').Trim() -ne 'x64') { throw 'Node platform/version mismatch.' }
if ((& $git --version).Trim() -ne ('git version ' + $contract.git.version)) { throw 'MinGit version mismatch.' }
$evidence = [ordered]@{ schemaVersion=1; nodeRoot=$nodeRoot; node=$node; git=$git; nodeArchiveSha256=$contract.node.archiveSha256; nodeExecutableSha256=$contract.node.executableSha256; gitArchiveSha256=$contract.git.archiveSha256; scope='Isolated tool preparation only; not a complete delivery or fresh-machine acceptance.' }
$evidence | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $target 'tools-preparation.json') -Encoding utf8
$evidence | ConvertTo-Json -Compress
