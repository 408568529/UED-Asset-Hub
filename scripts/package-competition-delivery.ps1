[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$HubZip,
  [Parameter(Mandatory=$true)][string]$HubZipSha256,
  [Parameter(Mandatory=$true)][string]$ToolsPreparation,
  [Parameter(Mandatory=$true)][string]$DshPreparation,
  [Parameter(Mandatory=$true)][string]$SourceBundle,
  [Parameter(Mandatory=$true)][string]$WorkDirectory,
  [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference='Stop'
if($env:OS -ne 'Windows_NT'){throw 'Windows x64 packaging is required.'}
Import-Module (Join-Path $PSScriptRoot 'Internal-Release.Common.psm1') -Force
$work=[IO.Path]::GetFullPath($WorkDirectory); $output=[IO.Path]::GetFullPath($OutputDirectory)
foreach($target in @($work,$output)){
  Assert-NoReparseAncestor $target
  if([IO.Path]::GetPathRoot($target).TrimEnd('\') -ieq $env:SystemDrive){throw 'Packaging and output must remain outside the system drive.'}
  if(Test-Path -LiteralPath $target){throw 'Packaging and output require unique new directories.'}
}
if($work.StartsWith($output.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase) -or $output.StartsWith($work.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase) -or $work -ieq $output){throw 'Packaging and output directories must be separate.'}
# Serialize maintainer builds and record ownership before any build work is created.
$resourceTool=Join-Path $PSScriptRoot 'competition-build-resources.mjs'
$resourceNode=(Get-Command node.exe -ErrorAction Stop).Source
& $resourceNode $resourceTool validate $work
if($LASTEXITCODE -ne 0){
  $buildArguments=@('-NoProfile','-NonInteractive','-File',$PSCommandPath)
  foreach($entry in $PSBoundParameters.GetEnumerator()){$buildArguments+=('-'+$entry.Key);$buildArguments+=[string]$entry.Value}
  & $resourceNode $resourceTool run (Split-Path -Parent $work) $work 'verified-internal-release,UED-Asset-Hub,temp' (Get-Process -Id $PID).Path @buildArguments
  if($LASTEXITCODE -ne 0){throw 'Isolated build failed; resource record and diagnostics retained.'}
  return
}
$archive=Get-UedArchiveManifest -ZipPath $HubZip -ExpectedSha256 $HubZipSha256
$null=[IO.Directory]::CreateDirectory($work); $null=[IO.Directory]::CreateDirectory($output)
$env:TEMP=Join-Path $work 'temp'; $env:TMP=$env:TEMP; $null=[IO.Directory]::CreateDirectory($env:TEMP)
$release=Join-Path $work 'verified-internal-release'
$null=Expand-UedInternalArchive -ZipPath $HubZip -Destination $release
$tools=Get-Content -LiteralPath $ToolsPreparation -Raw|ConvertFrom-Json
$candidate=Join-Path $work 'UED-Asset-Hub'
& $tools.node (Join-Path $PSScriptRoot 'build-competition-delivery.mjs') $release $ToolsPreparation $DshPreparation $SourceBundle $candidate
if($LASTEXITCODE -ne 0){throw 'Competition package assembly failed. The isolated work directory was retained; no candidate ZIP was produced.'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$name='UED-Asset-Hub-V2.5-candidate-'+$archive.Manifest.source.commit.Substring(0,12)+'-win-x64.zip'
$zip=Join-Path $output $name
[IO.Compression.ZipFile]::CreateFromDirectory($candidate,$zip,[IO.Compression.CompressionLevel]::Optimal,$true,[Text.Encoding]::UTF8)
$digest=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText(($zip+'.sha256'),($digest+'  '+$name+"`n"),[Text.UTF8Encoding]::new($false))
[pscustomobject]@{zip=$zip;sha256=$digest;source=$archive.Manifest.source;status='CANDIDATE_NOT_NEW_MACHINE_VERIFIED'}|ConvertTo-Json -Compress
