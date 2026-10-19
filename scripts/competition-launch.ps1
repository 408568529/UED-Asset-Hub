[CmdletBinding()]
param(
  [ValidateSet('Start','Stop','Check')][string]$Action = 'Start',
  [string]$DataRoot,
  [string]$ConfigPath,
  [switch]$ConfirmNewDirectory
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This entry point supports Windows x64 only.' }
$package = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$app = Join-Path $package 'app'
Import-Module (Join-Path $app 'scripts\Internal-Release.Common.psm1') -Force
Assert-NoReparseAncestor $package
if ([IO.Path]::GetPathRoot($package).TrimEnd('\') -ieq $env:SystemDrive) { throw 'Extract the competition package outside the system drive.' }
$node = Join-Path $package 'tools\node\node.exe'
$git = Join-Path $package 'tools\git\cmd\git.exe'
$manifestPath = Join-Path $package 'competition-manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'Complete competition-manifest.json is missing; this source tree is not a runnable delivery.' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1 -or $manifest.channel -ne 'V2.5_COMPETITION' -or $manifest.nodeVersion -ne '22.23.2') { throw 'Competition manifest identity is invalid.' }
foreach ($file in $manifest.files) {
  $relative = [string]$file.path
  if (-not $relative -or $relative.Contains('\') -or $relative.StartsWith('/') -or $relative -match '(^|/)\.\.?(/|$)|:') { throw 'Unsafe package manifest path.' }
  $target = Join-Path $package ($relative.Replace('/', '\'))
  Assert-NoReparseAncestor $target
  if (-not (Test-Path -LiteralPath $target -PathType Leaf) -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) { throw 'Competition package integrity verification failed.' }
}
foreach ($required in @('tools/node/node.exe','tools/git/cmd/git.exe','tools/competition-first-run.mjs','tools/competition-dependency-tree.mjs','tools/competition-prepare-package.mjs','tools/competition-launch.ps1')) {
  if (@($manifest.files | Where-Object { $_.path -ceq $required }).Count -ne 1) { throw 'Required executable or entry point has no unique package hash.' }
}
if ((& $node --version).Trim() -ne 'v22.23.2' -or (& $node -p 'process.arch').Trim() -ne 'x64') { throw 'The bundled Node version/architecture is incorrect.' }
if ((& $git --version).Trim() -ne 'git version 2.53.0.windows.2') { throw 'The bundled Git version is incorrect.' }
$env:Path = (Split-Path -Parent $node) + ';' + (Split-Path -Parent $git) + ';' + $env:Path
$locatorPath = Join-Path $package 'installation.json'
$sha = [Security.Cryptography.SHA256]::Create()
try { $identity = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($package.ToLowerInvariant())))).Replace('-','').Substring(0,24) } finally { $sha.Dispose() }
$mutex = [Threading.Mutex]::new($false, ('Local\UEDCompetition-' + $identity))
if (-not $mutex.WaitOne(0)) { $mutex.Dispose(); throw 'This installation is already starting or stopping. Wait and try again.' }
try {
  if ($Action -ne 'Stop') {
    & $node (Join-Path $package 'tools\competition-prepare-package.mjs') $package
    if ($LASTEXITCODE -ne 0) { throw 'Prepared dependencies failed identity/link validation. No user data was initialized.' }
  }
  if (Test-Path -LiteralPath $locatorPath) {
    if ($DataRoot -or $ConfigPath) { throw 'This package already has a saved installation; refusing to replace its paths.' }
    Assert-NoReparseAncestor $locatorPath
    $saved = Get-Content -LiteralPath $locatorPath -Raw | ConvertFrom-Json
    if ($saved.schemaVersion -ne 1 -or -not [IO.Path]::IsPathRooted([string]$saved.configPath)) { throw 'Saved installation is invalid.' }
    $ConfigPath = [string]$saved.configPath
  } elseif ($Action -ne 'Stop') {
    if (-not $ConfigPath) {
      if (-not $DataRoot) {
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = [Windows.Forms.FolderBrowserDialog]::new()
        $dialog.Description = 'Choose a parent folder outside C:. A new UED-Asset-Hub-Data folder will be created.'
        try {
          if ($dialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { throw 'Setup cancelled. No data was created.' }
          $DataRoot = Join-Path $dialog.SelectedPath 'UED-Asset-Hub-Data'
        } finally { $dialog.Dispose() }
      }
      if (-not $ConfirmNewDirectory) {
        Add-Type -AssemblyName System.Windows.Forms
        $answer = [Windows.Forms.MessageBox]::Show(('Create a new persistent data tree at:' + "`n" + $DataRoot), 'UED Asset Hub', [Windows.Forms.MessageBoxButtons]::OKCancel)
        if ($answer -ne [Windows.Forms.DialogResult]::OK) { throw 'Setup cancelled. No data was created.' }
      }
      $prepared = & $node (Join-Path $package 'tools\competition-first-run.mjs') init $package ([IO.Path]::GetFullPath($DataRoot))
      if ($LASTEXITCODE -ne 0) { throw 'First-run directory preparation failed. Existing files were retained; inspect the selected path before retrying.' }
      $ConfigPath = [string](($prepared | ConvertFrom-Json).configPath)
      # Only newly created directories receive a private ACL; an existing installation is never changed.
      $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
      $acl = [Security.AccessControl.DirectorySecurity]::new()
      $acl.SetSecurityDescriptorSddlForm(('O:{0}G:{0}D:P(A;OICI;FA;;;{0})(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)' -f $sid))
      Set-Acl -LiteralPath ([IO.Path]::GetFullPath($DataRoot)) -AclObject $acl
    }
    $ConfigPath = [IO.Path]::GetFullPath($ConfigPath)
    Assert-NoReparseAncestor $ConfigPath
    Assert-UedPrivateAcl $ConfigPath
    $locator = @{schemaVersion=1;configPath=$ConfigPath} | ConvertTo-Json -Compress
    $stream = [IO.File]::Open($locatorPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $bytes=[Text.Encoding]::UTF8.GetBytes($locator); $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }
  } else { throw 'No installation has been selected; nothing was stopped.' }
  Assert-NoReparseAncestor $ConfigPath
  Assert-UedPrivateAcl $ConfigPath
  $config = Set-UedRuntimeEnvironment $ConfigPath
  foreach ($key in @('DATA_DIR','TRAINING_MEDIA_DIR','AGENT_RUNTIME_DIR','ASSET_HUB_RUNTIME_DIR','DSH_SOURCE_DIR','DSH_RUNTIME_SOURCE_DIR','HALDUR_DESIGN_SKILL_ROOT','HALDUR_DESIGN_SKILL_RUNTIME_ROOT')) {
    if (-not [string]::IsNullOrEmpty([string]$config[$key])) {
      Assert-NoReparseAncestor ([string]$config[$key])
      if (-not (Test-Path -LiteralPath ([string]$config[$key]) -PathType Container)) { throw 'A saved data/dependency directory is missing; it will not be recreated.' }
    }
  }
  if ($env:DEEPSEEK_API_KEY) { throw 'Remove inherited DeepSeek credentials for this entry point. Configure your own Key in the existing administrator model settings.' }
  $env:NODE_ENV = 'production'
  $env:HOST_BIND_HOST = '127.0.0.1'
  $env:UED_STAGING_SHUTDOWN_ENABLED = 'true'
  Push-Location $app
  try {
    & $node 'scripts/internal-release-contract.mjs' verify --root $app
    if ($LASTEXITCODE -ne 0) { throw 'The immutable application release failed verification.' }
    & $node 'scripts/internal-release-preflight.mjs' $app
    if ($LASTEXITCODE -ne 0) { throw 'Runtime directory preflight failed.' }
    & $node 'scripts/host-security-preflight.mjs'
    if ($LASTEXITCODE -ne 0) { throw 'Existing administrator/HTTPS startup configuration is required. No security checks were bypassed; this installation is not ready.' }
  } finally { Pop-Location }
  if ($Action -eq 'Check') { Write-Output 'Preflight passed; no services were started.'; return }
  $statePath = Join-Path (Split-Path -Parent $ConfigPath) 'competition-process.json'
  $hostScript = Join-Path $app 'scripts\start-host.mjs'
  function Read-OwnedProcess {
    if (-not (Test-Path -LiteralPath $statePath)) { return $null }
    Assert-NoReparseAncestor $statePath
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    if ($state.packageRoot -ine $package -or [int]$state.supervisorPid -lt 1) { throw 'Saved process identity is invalid.' }
    $process = Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$state.supervisorPid)
    if (-not $process) { throw 'A previous supervisor exited without controlled shutdown. State was retained for diagnosis; no process was killed or restarted.' }
    if ($process.ExecutablePath -ine $node -or $process.CommandLine -notmatch [regex]::Escape($hostScript)) { throw 'PID no longer belongs to this installation; no process was controlled.' }
    return $process
  }
  $owned = Read-OwnedProcess
  $origin = ([Uri]$env:PUBLIC_ORIGIN).GetLeftPart([UriPartial]::Authority)
  if ($Action -eq 'Start' -and -not $owned) {
    foreach ($key in @('HOST_PORT','HOST_INTERNAL_PORT','DSH_PORT','AGENT_PROXY_PORT','KNOWLEDGE_GATEWAY_MCP_PORT')) {
      $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Any, [int]$config[$key])
      try { $probe.Start() } finally { $probe.Stop() }
    }
    $started = Start-Process -FilePath $node -ArgumentList @(('"' + $hostScript + '"')) -WorkingDirectory $app -PassThru
    @{schemaVersion=1;packageRoot=$package;supervisorPid=$started.Id} | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8
    $owned = Read-OwnedProcess
  }
  if (-not $owned) { throw 'This installation is not running; no process was stopped.' }
  $deadline = [DateTime]::UtcNow.AddSeconds(120)
  $ready = $false
  $adminSession = $null
  while ([DateTime]::UtcNow -lt $deadline) {
    $owned = Read-OwnedProcess
    $listener = @(Get-NetTCPConnection -State Listen -LocalPort ([int]$config.HOST_PORT) -ErrorAction SilentlyContinue)
    if ($listener.Count -gt 0 -and @($listener | Where-Object { $_.OwningProcess -ne $owned.ProcessId }).Count -gt 0) { throw 'The Hub port belongs to another process. No action was taken.' }
    if ($listener.Count -gt 0) {
      try {
        if (-not $adminSession) {
          $login = @{username=$env:ADMIN_USERNAME;password=$env:ADMIN_PASSWORD} | ConvertTo-Json -Compress
          if (-not $env:ADMIN_USERNAME) { $login=@{username='admin';password=$env:ADMIN_PASSWORD}|ConvertTo-Json -Compress }
          $null = Invoke-WebRequest -UseBasicParsing -Uri ($origin + '/api/auth/login') -Method Post -ContentType 'application/json' -Body $login -SessionVariable adminSession -TimeoutSec 5
          $login=$null
        }
        if ($Action -eq 'Stop') { $ready=$true; break }
        $status = Invoke-RestMethod -Uri ($origin + '/api/runtime/status') -WebSession $adminSession -TimeoutSec 5
        if ($status.runtime.status -eq 'ready' -or ($status.runtime.status -eq 'configuration_required' -and $status.runtime.reasonCode -eq 'credential_missing')) { $ready=$true; break }
      } catch { $login=$null }
    }
    Start-Sleep -Milliseconds 500
  }
  $login=$null
  if (-not $ready) { throw 'The owned runtime did not become healthy in time. State was retained; inspect diagnostics and use controlled stop. No automatic restart was attempted.' }
  if ($Action -eq 'Start') {
    $destination = if ($status.runtime.reasonCode -eq 'credential_missing') { '/agent/settings' } else { '/' }
    Start-Process ($origin + $destination)
    Write-Output 'The existing Supervisor is ready. Configure DeepSeek only in the administrator model settings.'
  } else {
    $null = Invoke-RestMethod -Uri ($origin + '/api/staging-shutdown') -Method Post -Headers @{Origin=$origin} -ContentType 'application/json' -Body '{}' -WebSession $adminSession -TimeoutSec 10
    $deadline = [DateTime]::UtcNow.AddSeconds(100)
    while ([DateTime]::UtcNow -lt $deadline -and (Get-Process -Id $owned.ProcessId -ErrorAction SilentlyContinue)) { Start-Sleep -Milliseconds 500 }
    if (Get-Process -Id $owned.ProcessId -ErrorAction SilentlyContinue) { throw 'Controlled stop is incomplete; no force termination was performed.' }
    foreach ($key in @('HOST_PORT','HOST_INTERNAL_PORT','DSH_PORT','AGENT_PROXY_PORT','KNOWLEDGE_GATEWAY_MCP_PORT')) {
      if (Get-NetTCPConnection -State Listen -LocalPort ([int]$config[$key]) -ErrorAction SilentlyContinue) { throw 'A configured port remains occupied after shutdown. Process state was retained; inspect diagnostics.' }
    }
    Remove-Item -LiteralPath $statePath
    Write-Output 'Controlled Supervisor shutdown completed.'
  }
} catch {
  # Do not print WebRequest bodies, credential values or arbitrary nested exceptions.
  if ($_.Exception.Message -match '^(Existing |This |The |A |An |Choose |Extract |Setup |Saved |PID |Complete |Competition |Required |First-run |Preflight |Runtime |Pinned |Controlled |No |Remove |Unsafe )') { Write-Error $_.Exception.Message -ErrorAction Continue }
  else { Write-Error 'Competition entry failed. No other installation was stopped. Check setup paths, dependencies and the existing secure startup configuration.' -ErrorAction Continue }
  exit 1
} finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
