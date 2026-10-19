[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$SourceBundlePath,
  [Parameter(Mandatory = $true)][string]$SourceInputPath,
  [Parameter(Mandatory = $true)][string]$SourceCommit,
  [Parameter(Mandatory = $true)][string]$BuildRoot,
  [Parameter(Mandatory = $true)][string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if ($env:OS -ne 'Windows_NT' -or [Environment]::Is64BitOperatingSystem -ne $true) { throw 'INTERNAL_RELEASE builds require Windows x64.' }
if ($SourceCommit -notmatch '^[a-f0-9]{40}$') { throw 'SourceCommit must be a full Git SHA.' }
$build = [System.IO.Path]::GetFullPath($BuildRoot)
$output = [System.IO.Path]::GetFullPath($OutputDirectory)
foreach ($target in @($build, $output)) { if (Test-Path -LiteralPath $target) { throw 'BuildRoot and OutputDirectory must be new, unique directories.' } }
if ($build.Equals($output, [System.StringComparison]::OrdinalIgnoreCase) -or $build.StartsWith($output.TrimEnd('\') + '\', [System.StringComparison]::OrdinalIgnoreCase) -or $output.StartsWith($build.TrimEnd('\') + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'BuildRoot and OutputDirectory must be separate.' }

# Serialize maintainer builds and record ownership before any build work is created.
$resourceTool=Join-Path $PSScriptRoot 'competition-build-resources.mjs'
$resourceNode=(Get-Command node.exe -ErrorAction Stop).Source
& $resourceNode $resourceTool validate $build
if($LASTEXITCODE -ne 0){
  $buildArguments=@('-NoProfile','-NonInteractive','-File',$PSCommandPath)
  foreach($entry in $PSBoundParameters.GetEnumerator()){$buildArguments+=('-'+$entry.Key);$buildArguments+=[string]$entry.Value}
  & $resourceNode $resourceTool run (Split-Path -Parent $build) $build 'source,payload,toolchain,temp' (Get-Process -Id $PID).Path @buildArguments
  if($LASTEXITCODE -ne 0){throw 'Isolated build failed; resource record and diagnostics retained.'}
  return
}
$sourceIdentity = Get-Content -LiteralPath $SourceInputPath -Raw | ConvertFrom-Json
$bundleHash = (Get-FileHash -LiteralPath $SourceBundlePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($sourceIdentity.schemaVersion -ne 1 -or $sourceIdentity.channel -ne 'INTERNAL_RELEASE_INPUT' -or $sourceIdentity.commit -ne $SourceCommit -or $sourceIdentity.bundleSha256 -ne $bundleHash) { throw 'Source bundle identity does not match source-input.json.' }
$git = Get-Command git.exe -ErrorAction SilentlyContinue
if (-not $git) { throw 'Git is required in the Windows build environment.' }

$null = [System.IO.Directory]::CreateDirectory($build)
$null = [System.IO.Directory]::CreateDirectory($output)
$env:TEMP=Join-Path $build 'temp';$env:TMP=$env:TEMP;$null=[IO.Directory]::CreateDirectory($env:TEMP)
Import-Module (Join-Path $PSScriptRoot 'Internal-Release.Common.psm1') -Force
Assert-NoReparseAncestor $build
Assert-NoReparseAncestor $output
$sourceRoot = Join-Path $build 'source'
$payloadRoot = Join-Path $build 'payload'
$toolchainRoot = Join-Path $build 'toolchain'
$nodeModulesCache = Join-Path $env:UED_BUILD_CACHE_ROOT 'npm-cache'
$npmUserConfig = Join-Path $build 'npmrc'
$npmGlobalConfig = Join-Path $build 'npm-globalrc'
$npmBootstrapRoot = Join-Path $toolchainRoot 'npm-bootstrap'

$removedEnvironment = @('ADMIN_PASSWORD','ADMIN_SESSION_SECRET','AGENT_GATEWAY_TOKEN','DEEPSEEK_API_KEY','OPENAI_API_KEY','RUNTIME_CONTROL_TOKEN','TEST_ENV_ENCRYPTION_KEY','NPM_TOKEN','GITHUB_TOKEN','GH_TOKEN','DATA_DIR','TRAINING_MEDIA_DIR','AGENT_RUNTIME_DIR','ASSET_HUB_RUNTIME_DIR','DSH_SOURCE_DIR','DSH_RUNTIME_SOURCE_DIR','NODE_OPTIONS','NEXTAUTH_SECRET','JWT_SECRET','SESSION_SECRET','AWS_SECRET_ACCESS_KEY')
foreach ($name in $removedEnvironment) { Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue }
$env:NPM_CONFIG_CACHE = $nodeModulesCache
$env:NPM_CONFIG_USERCONFIG = $npmUserConfig
$env:NPM_CONFIG_GLOBALCONFIG = $npmGlobalConfig
$env:NPM_CONFIG_AUDIT = 'false'
$env:NPM_CONFIG_FUND = 'false'
$null = [System.IO.Directory]::CreateDirectory($toolchainRoot)
Set-Content -LiteralPath $npmUserConfig -Value "registry=https://registry.npmjs.org/`nalways-auth=false`naudit=false`nfund=false`n" -Encoding ASCII
Set-Content -LiteralPath $npmGlobalConfig -Value '' -Encoding ASCII
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
$nodeArchiveName = 'node-v22.23.2-win-x64.zip'
$nodeArchivePath = Join-Path $toolchainRoot $nodeArchiveName
$nodeChecksumsPath = Join-Path $toolchainRoot 'SHASUMS256.txt'
Invoke-WebRequest -UseBasicParsing -Uri 'https://nodejs.org/dist/v22.23.2/SHASUMS256.txt' -OutFile $nodeChecksumsPath
$nodeChecksumLine = Select-String -LiteralPath $nodeChecksumsPath -Pattern "^[0-9a-f]{64}\s+$([regex]::Escape($nodeArchiveName))$" | Select-Object -First 1
if (-not $nodeChecksumLine) { throw 'Official Node.js checksum entry was not found.' }
$expectedNodeSha = (($nodeChecksumLine.Line -split '\s+')[0]).ToLowerInvariant()
Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v22.23.2/$nodeArchiveName" -OutFile $nodeArchivePath
if ((Get-FileHash -LiteralPath $nodeArchivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedNodeSha) { throw 'Pinned Node.js archive SHA-256 mismatch.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($nodeArchivePath, $toolchainRoot)
$nodeExe = Join-Path $toolchainRoot 'node-v22.23.2-win-x64\node.exe'
$systemNpm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $systemNpm) { throw 'npm.cmd is required to bootstrap the pinned npm distribution.' }
$null = [System.IO.Directory]::CreateDirectory($npmBootstrapRoot)
& $systemNpm.Source install --prefix $npmBootstrapRoot --ignore-scripts --no-save --no-audit --no-fund 'npm@10.9.8'
if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the pinned npm distribution in the isolated toolchain root.' }
$npmCli = Join-Path $npmBootstrapRoot 'node_modules\npm\bin\npm-cli.js'
$nodeVersion = (& $nodeExe --version).Trim()
$npmVersion = (& $nodeExe $npmCli --version).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -ne 'v22.23.2' -or $npmVersion -ne '10.9.8') { throw 'Isolated build toolchain must use Node.js 22.23.2 and npm 10.9.8.' }
if ((& $nodeExe -p 'process.arch').Trim() -ne 'x64') { throw 'Build Node.js architecture must be x64.' }
$env:Path = (Split-Path -Parent $nodeExe) + ';' + $env:Path

$vswhere = Join-Path ([Environment]::GetEnvironmentVariable('ProgramFiles(x86)')) 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere -PathType Leaf)) { throw 'Visual Studio Build Tools with x64 MSVC are required for Windows native helpers.' }
$vsRoot = (& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Select-Object -First 1).Trim()
if (-not $vsRoot) { throw 'Visual Studio x64 MSVC component is not installed.' }
$vsDevCmd = Join-Path $vsRoot 'Common7\Tools\VsDevCmd.bat'
if (-not (Test-Path -LiteralPath $vsDevCmd -PathType Leaf)) { throw 'Visual Studio VsDevCmd.bat is missing.' }
$compilerEnvironment = & $env:ComSpec /d /s /c "call `"$vsDevCmd`" -arch=x64 -host_arch=x64 >nul && set"
if ($LASTEXITCODE -ne 0) { throw 'Could not load the isolated Visual Studio x64 compiler environment.' }
foreach ($line in $compilerEnvironment) {
  $separator = $line.IndexOf('=')
  if ($separator -gt 0) { [Environment]::SetEnvironmentVariable($line.Substring(0, $separator), $line.Substring($separator + 1), 'Process') }
}
$compiler = Get-Command cl.exe -ErrorAction SilentlyContinue
if (-not $compiler) { throw 'Visual Studio x64 compiler cl.exe was not loaded.' }
$vsVersion = (& $vswhere -latest -products '*' -property catalog_productDisplayVersion | Select-Object -First 1).Trim()

function Invoke-Checked([string]$Executable, [string[]]$Arguments, [string]$WorkingDirectory) {
  Push-Location $WorkingDirectory
  try {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$([System.IO.Path]::GetFileName($Executable)) failed with exit code $LASTEXITCODE." }
  } finally { Pop-Location }
}

function Copy-RegularTree([string]$Source, [string]$Destination, [switch]$SkipBin) {
  $sourceRoot = [System.IO.Path]::GetFullPath($Source)
  if (-not (Test-Path -LiteralPath $Destination)) { $null = [System.IO.Directory]::CreateDirectory($Destination) }
  $pending = [System.Collections.Generic.Stack[string]]::new()
  $pending.Push($sourceRoot)
  while ($pending.Count -gt 0) {
    $directory = $pending.Pop()
    foreach ($item in Get-ChildItem -LiteralPath $directory -Force) {
      if ($SkipBin -and $item.Name -eq '.bin') { continue }
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Build input contains a link/reparse point: $($item.FullName)" }
      $relative = $item.FullName.Substring($sourceRoot.Length).TrimStart('\')
      $target = Join-Path $Destination $relative
      if ($item.PSIsContainer) {
        $null = [System.IO.Directory]::CreateDirectory($target)
        $pending.Push($item.FullName)
      } else {
        $parent = Split-Path -Parent $target
        $null = [System.IO.Directory]::CreateDirectory($parent)
        Copy-Item -LiteralPath $item.FullName -Destination $target
      }
    }
  }
}

function Copy-RegularFile([string]$Source, [string]$Destination) {
  $item = Get-Item -LiteralPath $Source -Force
  if ($item.PSIsContainer -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Expected a regular file: $Source" }
  $null = [System.IO.Directory]::CreateDirectory((Split-Path -Parent $Destination))
  Copy-Item -LiteralPath $Source -Destination $Destination
}

& $git.Source clone --no-checkout $SourceBundlePath $sourceRoot
if ($LASTEXITCODE -ne 0) { throw 'Could not clone the exact source bundle.' }
Invoke-Checked $git.Source @('checkout', '--detach', $SourceCommit) $sourceRoot
if ((& $git.Source -C $sourceRoot rev-parse HEAD).Trim() -ne $SourceCommit) { throw 'Checked-out source Commit does not match the requested Commit.' }
if ((& $git.Source -C $sourceRoot rev-parse 'HEAD^{tree}').Trim() -ne [string]$sourceIdentity.tree) { throw 'Checked-out source Tree does not match source-input.json.' }
$sourceStatus = ((& $git.Source -C $sourceRoot status --porcelain=v1) -join "`n").Trim()
if ($sourceStatus) { throw 'Extracted source tree is not clean.' }
$dotenv = @(Get-ChildItem -LiteralPath $sourceRoot -Force -Recurse -File | Where-Object { $_.Name -match '^\.env(?:\.|$)' -and $_.Name -ine '.env.example' })
if ($dotenv.Count -gt 0) { throw 'Source commit contains a prohibited dotenv file.' }

$dsh = Get-Content -LiteralPath (Join-Path $sourceRoot 'agent-integration\dsh\version.json') -Raw | ConvertFrom-Json
if ($dsh.sourceRepository -ne 'https://github.com/deepseek-ai/deepseek-harness.git' -or $dsh.sourceRef -ne 'refs/tags/dsh-v0.1.1-rc.2' -or $dsh.version -ne '0.1.1-rc.2' -or $dsh.sourceCommit -ne 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e' -or $dsh.sourceTree -ne '53915efe4e2126cc7779b73dfc8a3bcec5318c44') { throw 'DSH source identity is not pinned to the approved version.' }
$dshInfo = [pscustomobject]@{
  repository = $dsh.sourceRepository
  ref = $dsh.sourceRef
  version = $dsh.version
  commit = $dsh.sourceCommit
  tree = $dsh.sourceTree
  fingerprint = $dsh.sourceFingerprint
  packageManager = 'pnpm@11.7.0'
  license = 'MIT'
  licenseNotice = 'The separately installed official DSH checkout must retain its upstream LICENSE and THIRD_PARTY_NOTICES.md.'
  distribution = 'external-pinned-source-install'
}
$dshInfoPath = Join-Path $build 'dsh-info.json'
[System.IO.File]::WriteAllText($dshInfoPath, ($dshInfo | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))

Invoke-Checked $nodeExe @($npmCli, 'ci', '--ignore-scripts', '--no-audit', '--no-fund') $sourceRoot
Invoke-Checked $nodeExe @($npmCli, 'run', 'build') $sourceRoot
# Next regenerates this declaration; restore only this isolated build clone's tracked input.
$originalNextEnv = ((& $git.Source -C $sourceRoot show 'HEAD:next-env.d.ts') -join "`n") + "`n"
if ($LASTEXITCODE -ne 0) { throw 'Could not read the committed Next declaration.' }
[IO.File]::WriteAllText((Join-Path $sourceRoot 'next-env.d.ts'), $originalNextEnv, [Text.UTF8Encoding]::new($false))
foreach ($script in @('build-windows-job-helper.mjs','build-windows-pipe-security-adapter.mjs','build-windows-dpapi-credential-helper.mjs')) {
  Invoke-Checked $nodeExe @("scripts/$script", '--mode', 'developer-source-output') $sourceRoot
}
$closurePath = Join-Path $build 'runtime-closure.json'
Invoke-Checked $nodeExe @('scripts/internal-release-contract.mjs', 'closure', '--root', $sourceRoot, '--output', $closurePath) $sourceRoot
Invoke-Checked $nodeExe @($npmCli, 'prune', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund') $sourceRoot

$null = [System.IO.Directory]::CreateDirectory($payloadRoot)
Copy-RegularTree (Join-Path $sourceRoot '.next\standalone') $payloadRoot
if (Test-Path -LiteralPath (Join-Path $sourceRoot '.next\static') -PathType Container) { Copy-RegularTree (Join-Path $sourceRoot '.next\static') (Join-Path $payloadRoot '.next\static') }
else { throw 'Next.js standalone build did not produce .next/static.' }
if (Test-Path -LiteralPath (Join-Path $sourceRoot 'public') -PathType Container) { Copy-RegularTree (Join-Path $sourceRoot 'public') (Join-Path $payloadRoot 'public') }
Remove-Item -LiteralPath (Join-Path $payloadRoot 'node_modules') -Recurse -Force -ErrorAction SilentlyContinue
Copy-RegularTree (Join-Path $sourceRoot 'node_modules') (Join-Path $payloadRoot 'node_modules') -SkipBin

$closure = Get-Content -LiteralPath $closurePath -Raw | ConvertFrom-Json
foreach ($relative in $closure) { Copy-RegularFile (Join-Path $sourceRoot $relative) (Join-Path $payloadRoot ($relative.Replace('/', '\'))) }
foreach ($relative in @(
  'scripts/internal-release-contract.mjs', 'scripts/internal-release-preflight.mjs', 'scripts/host-security-preflight.mjs', 'scripts/start-internal-release.ps1', 'scripts/start-current-internal-release.ps1', 'scripts/install-internal-dsh-runtime.ps1', 'scripts/verify-dsh-runtime-source.mjs', 'scripts/Internal-Release.Common.psm1',
  'agent-integration/dsh/genui-client-bootstrap/package.json', 'agent-integration/dsh/genui-client-bootstrap/index.mjs',
  'agent-integration/scripts/dsh-source-validator.mjs', 'agent-integration/dsh/version.json', 'agent-integration/dsh/genui-plugin.json', 'agent-integration/scripts/genui-client-load-liveness.mjs', 'agent-integration/dsh/packages/dsh-plugin-genui-0.15.1.tgz', 'agent-integration/dsh/asset-hub-agent.overlay.yml', 'agent-integration/dsh/agent-presets/asset-hub-restricted/agent.cordis.yml',
  'agent-integration/dsh/agent-presets/asset-hub-restricted/preset.yml', 'agent-integration/dsh/agent-presets/asset-hub-genui-restricted/agent.cordis.yml', 'agent-integration/dsh/agent-presets/asset-hub-genui-restricted/preset.yml', 'service/windows/internal-runtime-config.example.psd1', 'INTERNAL-RELEASE-README.md'
)) { Copy-RegularFile (Join-Path $sourceRoot $relative) (Join-Path $payloadRoot ($relative.Replace('/', '\'))) }
foreach ($relative in @('service/windows/UEDAssetHub.xml.template','service/windows/UEDAssetHubEdge.web.config.template','service/windows/node-22.23.2-x64.artifact.json','service/windows/winsw-2.12.0-x64.artifact.json','service/windows/security-foundation.contract.json')) {
  Copy-RegularFile (Join-Path $sourceRoot $relative) (Join-Path $payloadRoot ($relative.Replace('/', '\')))
}
foreach ($helper in @('windows-job-helper','windows-pipe-security-adapter','windows-dpapi-credential-helper')) {
  $binaryName = switch ($helper) {
    'windows-job-helper' { 'ued-windows-job-helper' }
    'windows-pipe-security-adapter' { 'ued-windows-pipe-security-adapter' }
    'windows-dpapi-credential-helper' { 'ued-windows-dpapi-credential-helper' }
  }
  foreach ($extension in @('.exe','.manifest.json')) {
    $relative = "native/$helper/bin/$binaryName$extension"
    Copy-RegularFile (Join-Path $sourceRoot ($relative.Replace('/', '\'))) (Join-Path $payloadRoot ($relative.Replace('/', '\')))
  }
}
if (-not (Test-Path -LiteralPath (Join-Path $payloadRoot 'server.js') -PathType Leaf)) { throw 'Standalone server.js is missing.' }
if (-not (Test-Path -LiteralPath (Join-Path $payloadRoot 'node_modules\@modelcontextprotocol\sdk') -PathType Container)) { throw 'Knowledge MCP dependency is missing from production node_modules.' }
foreach ($file in @(Get-ChildItem -LiteralPath $payloadRoot -Force -Recurse -File | Where-Object { $_.Name -match '\.map$' -or ($_.FullName -notmatch '[\\/]node_modules[\\/].*\.d\.(ts|mts|cts)$' -and $_.Name -match '\.(ts|tsx|mts|cts)$') })) { Remove-Item -LiteralPath $file.FullName -Force }

$package = Get-Content -LiteralPath (Join-Path $sourceRoot 'package.json') -Raw | ConvertFrom-Json
$buildInfo = [pscustomobject]@{ node = $nodeVersion; npm = $npmVersion; platform = 'win32-x64'; visualStudio = $vsVersion; msvcCompiler = (Get-Item $compiler.Source).VersionInfo.FileVersion; sourceCommit = $SourceCommit; builtAtUtc = [DateTime]::UtcNow.ToString('o') }
$buildInfoPath = Join-Path $build 'build-info.json'
[System.IO.File]::WriteAllText($buildInfoPath, ($buildInfo | ConvertTo-Json -Depth 4), [System.Text.UTF8Encoding]::new($false))
$releaseVersion = 'internal-{0}-{1}' -f $package.version, $SourceCommit.Substring(0, 12)
Invoke-Checked $nodeExe @('scripts/internal-release-contract.mjs', 'manifest', '--root', $payloadRoot, '--sourceCommit', $SourceCommit, '--sourceTree', [string]$sourceIdentity.tree, '--releaseVersion', $releaseVersion, '--builtAtUtc', [string]$buildInfo.builtAtUtc, '--buildInfo', $buildInfoPath, '--dshInfo', $dshInfoPath) $sourceRoot
Invoke-Checked $nodeExe @('scripts/internal-release-contract.mjs', 'verify', '--root', $payloadRoot) $sourceRoot

$zipPath = Join-Path $output "UED-Asset-Hub-$releaseVersion-win-x64.zip"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  $payloadPrefix = [System.IO.Path]::GetFullPath($payloadRoot).TrimEnd('\') + '\'
  foreach ($file in Get-ChildItem -LiteralPath $payloadRoot -Force -Recurse -File) {
    if (($file.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw "ZIP input is a link/reparse point: $($file.FullName)" }
    $entryName = $file.FullName.Substring($payloadPrefix.Length).Replace('\', '/')
    $null = [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal)
  }
} finally { $archive.Dispose() }
$zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath "$zipPath.sha256" -Value "$zipHash  $(Split-Path -Leaf $zipPath)" -Encoding ASCII
Copy-RegularFile (Join-Path $payloadRoot 'release-manifest.json') (Join-Path $output 'release-manifest.json')
Copy-RegularFile $SourceInputPath (Join-Path $output 'source-input.json')
$toolsRoot = Join-Path $output 'tools'
foreach ($relative in @('scripts/Internal-Release.Common.psm1','scripts/install-internal-release.ps1','scripts/activate-internal-release.ps1','scripts/rollback-internal-release.ps1','scripts/status-internal-release.ps1','service/windows/internal-runtime-config.example.psd1','INTERNAL-RELEASE-README.md')) {
  Copy-RegularFile (Join-Path $sourceRoot ($relative.Replace('/', '\'))) (Join-Path $toolsRoot (Split-Path -Leaf $relative))
}
Write-Output ([pscustomobject]@{ result = 'PASS'; channel = 'INTERNAL_RELEASE'; releaseVersion = $releaseVersion; sourceCommit = $SourceCommit; sourceTree = $sourceIdentity.tree; zipPath = $zipPath; zipSha256 = $zipHash; payloadFileCount = (Get-Content -LiteralPath (Join-Path $payloadRoot 'release-manifest.json') -Raw | ConvertFrom-Json).fileCount } | ConvertTo-Json -Compress)
