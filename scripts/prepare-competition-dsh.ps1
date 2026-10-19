[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$ReleaseRoot,
  [Parameter(Mandatory=$true)][string]$ToolsPreparation,
  [Parameter(Mandatory=$true)][string]$SourceBundlePath,
  [Parameter(Mandatory=$true)][string]$SourceBundleSha256,
  [Parameter(Mandatory=$true)][string]$Destination
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Windows x64 preparation is required.' }
$release = [IO.Path]::GetFullPath($ReleaseRoot)
$root = [IO.Path]::GetFullPath($Destination)
Import-Module (Join-Path $release 'scripts\Internal-Release.Common.psm1') -Force
Assert-NoReparseAncestor $root
if ([IO.Path]::GetPathRoot($root).TrimEnd('\') -ieq $env:SystemDrive) { throw 'Prepare all dependencies outside the system drive.' }
if (Test-Path -LiteralPath $root) { throw 'Dependency preparation requires a new, isolated directory.' }
$tools = Get-Content -LiteralPath $ToolsPreparation -Raw | ConvertFrom-Json
if ($tools.nodeExecutableSha256 -ne '0d0f5e39f9f3d9587bc19f73eab3c2c9c4903fd02d6dbf9c853dd81b3d95fad4' -or (Get-FileHash -LiteralPath $tools.node -Algorithm SHA256).Hash.ToLowerInvariant() -ne $tools.nodeExecutableSha256) { throw 'Verified pinned Node preparation is required.' }
$env:Path = $tools.nodeRoot + ';' + (Split-Path -Parent $tools.git) + ';' + $env:Path
$null = [IO.Directory]::CreateDirectory($root)
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$acl = [Security.AccessControl.DirectorySecurity]::new()
$acl.SetSecurityDescriptorSddlForm(('O:{0}G:{0}D:P(A;OICI;FA;;;{0})(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)' -f $sid))
Set-Acl -LiteralPath $root -AclObject $acl
foreach ($name in @('temp','npm-cache','corepack-cache','pnpm-store','dependencies','empty-data','profile-seed')) { $null=[IO.Directory]::CreateDirectory((Join-Path $root $name)) }
$env:TMP=Join-Path $root 'temp'; $env:TEMP=$env:TMP
$env:COREPACK_HOME=Join-Path $root 'corepack-cache'
$env:NPM_CONFIG_CACHE=Join-Path $root 'npm-cache'
$env:npm_config_devdir=Join-Path $root 'node-gyp-cache'
# Upstream tracks file symlinks; do not silently replace them or weaken provenance validation.
$probeTarget=Join-Path $root 'temp\symlink-target'; $probeLink=Join-Path $root 'temp\symlink-probe'
[IO.File]::WriteAllText($probeTarget,'synthetic')
& $tools.node -e 'const fs=require("node:fs");fs.symlinkSync(process.argv[1],process.argv[2],"file");fs.unlinkSync(process.argv[2]);' $probeTarget $probeLink
if ($LASTEXITCODE -ne 0) { throw 'Windows file-symlink permission is required by the existing DSH source contract. No policy or validator was changed.' }
Remove-Item -LiteralPath $probeTarget
$config = [ordered]@{
  DATA_DIR=(Join-Path $root 'empty-data\hub-data'); TRAINING_MEDIA_DIR=(Join-Path $root 'empty-data\training-media')
  AGENT_RUNTIME_DIR=(Join-Path $root 'profile-seed'); ASSET_HUB_RUNTIME_DIR=(Join-Path $root 'empty-data\asset-hub-runtime')
  DSH_SOURCE_DIR=(Join-Path $root 'dependencies\dsh-source'); DSH_RUNTIME_SOURCE_DIR=(Join-Path $root 'dependencies\dsh-runtime')
}
foreach ($key in @('DATA_DIR','TRAINING_MEDIA_DIR','ASSET_HUB_RUNTIME_DIR')) { $null=[IO.Directory]::CreateDirectory($config[$key]) }
$configPath=Join-Path $root 'runtime.psd1'
$text="@{`n"; foreach($entry in $config.GetEnumerator()) { $text += '  ' + $entry.Key + " = '" + $entry.Value.Replace("'","''") + "'`n" }; $text+="}`n"
[IO.File]::WriteAllText($configPath,$text,[Text.UTF8Encoding]::new($false))
& (Join-Path $release 'scripts\install-internal-dsh-runtime.ps1') -ReleaseRoot $release -ConfigPath $configPath -SourceBundlePath $SourceBundlePath -ExpectedSourceBundleSha256 $SourceBundleSha256
if ($LASTEXITCODE -ne 0) { throw 'Existing pinned DSH/official Plugin Manager preparation failed.' }
$home=Join-Path $root 'profile-seed\dsh-home'
foreach($name in @('.credentials.yaml','.env','sessions','genui-artifacts')) { if(Test-Path -LiteralPath (Join-Path $home $name)) { throw 'Prepared plugin seed contains forbidden user state; delivery stopped.' } }
$env:DSH_HOME=$null
$evidence=[ordered]@{schemaVersion=1;platform='win32-x64';nodeVersion='22.23.2';dshCommit='b150a551b8d465e31e418e1b2eaf5e79bbb7d28e';genui='0.15.1';dependencyRoot=(Join-Path $root 'dependencies');genuiHome=$home;sourceBundleSha256=$SourceBundleSha256;userDataIncluded=$false;servicesStarted=$false}
$evidence|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $root 'dsh-preparation.json') -Encoding utf8
$evidence|ConvertTo-Json -Compress
