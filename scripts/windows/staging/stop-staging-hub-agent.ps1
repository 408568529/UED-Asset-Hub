param([ValidateRange(10,180)][int]$TimeoutSeconds = 90)

$ErrorActionPreference = 'Stop'
$root = 'D:\UED-Asset-Hub-Staging\staging\internal-stable-security-227da49-20261010-0211Z'
$settingsPath = 'D:\UED-Asset-Hub-Staging\credentials\internal-stable-security-227da49-https\staging-settings.json'
$credentialPath = 'D:\UED-Asset-Hub-Staging\credentials\internal-stable-security-227da49-https\staging-admin-auth.dpapi'
$runtimePorts = @(3037,3038,3080,3081,3082)
$allPorts = @($runtimePorts + 4443)
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$evidence = Join-Path $root "logs\tls-supervisor-continuation-20261012\controlled-stop-$stamp.ndjson"
$settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
$agentRuntime = [string]$settings.agentRuntimeDir
$metadataPath = Join-Path $agentRuntime 'supervisor\managed-processes.json'
$lockPath = Join-Path $agentRuntime 'supervisor\supervisor-lock.json'
$lifecyclePath = Join-Path $agentRuntime 'logs\runtime-supervisor.ndjson'

function get-OwnedProcess([int]$processId) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId"
  if (!$process) { return $null }
  $exe = [string]$process.ExecutablePath
  $command = [string]$process.CommandLine
  if (!$exe.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or $command -notlike "*$root*") { throw "Refusing PID $processId because its identity is outside the staging root." }
  return $process
}

function write-Evidence($summary) {
  New-Item -ItemType Directory -Path (Split-Path $evidence) -Force | Out-Null
  $summary | ConvertTo-Json -Depth 8 -Compress | Add-Content -LiteralPath $evidence -Encoding utf8
  $summary | ConvertTo-Json -Depth 8 -Compress
  Write-Output "EVIDENCE=$evidence"
}

$listeners = @(Get-NetTCPConnection -State Listen -LocalPort $allPorts -ErrorAction SilentlyContinue)
$runtimeListeners = @($listeners | Where-Object { $runtimePorts -contains $_.LocalPort })
if ($runtimeListeners.Count -eq 0) {
  if (Test-Path -LiteralPath $lockPath) { throw 'Runtime ports are clear, but the Supervisor lock remains.' }
  $stagingHost = @(Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%start-host.mjs%'" | Where-Object { $_.ExecutablePath.StartsWith((Join-Path $root 'toolchains\node-v22.23.3-win-x64'), [StringComparison]::OrdinalIgnoreCase) -and $_.CommandLine -like "*$root\code\scripts\start-host.mjs*" })
  if ($stagingHost.Count -gt 0) { throw 'Runtime ports and lock are clear, but a staging Supervisor Host process remains.' }
  if (Test-Path -LiteralPath $metadataPath) {
    $priorMetadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
    foreach ($record in @($priorMetadata.processes)) {
      if ($record.managedState -ne 'exited') { throw "Runtime ports and lock are clear, but $($record.component) is not recorded exited." }
      foreach ($processId in @($record.pid, $record.jobOwnership.helperPid)) {
        if ($processId -and (Get-CimInstance Win32_Process -Filter "ProcessId=$processId")) { throw "Runtime ports and lock are clear, but an owned $($record.component) PID remains." }
      }
      if ($record.jobOwnership -and $record.jobOwnership.helperExited -ne $true) { throw "Runtime ports and lock are clear, but $($record.component) Job helper exit is not verified." }
    }
  }
  $edge = $listeners | Where-Object { $_.LocalPort -eq 4443 } | Select-Object -First 1
  $edgeResult = 'not_listening'
  if ($edge) {
    $edgeProcess = get-OwnedProcess ([int]$edge.OwningProcess)
    if ($edgeProcess.CommandLine -notlike '*runtime\https\https-edge.cjs*') { throw 'Refusing cleanup: port 4443 is not owned by the staging HTTPS edge.' }
    $edgeResult = 'listening_unchanged'
  }
  write-Evidence @{ type='supervisor-stop'; status='ALREADY_STOPPED'; at=(Get-Date).ToUniversalTime().ToString('o'); supervisorGraceful=$false; idempotent=$true; httpsEdge=$edgeResult; httpsEdgeIsOutsideSupervisor=$true }
  return
}

foreach ($processId in @($runtimeListeners | Select-Object -ExpandProperty OwningProcess -Unique)) { $null = get-OwnedProcess ([int]$processId) }
$edge = $listeners | Where-Object { $_.LocalPort -eq 4443 } | Select-Object -First 1
if ($edge) {
  $edgeProcess = get-OwnedProcess ([int]$edge.OwningProcess)
  if ($edgeProcess.CommandLine -notlike '*runtime\https\https-edge.cjs*') { throw 'Refusing to stop port 4443: process is not the staging HTTPS edge.' }
}
$metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
if (!$metadata.supervisorInstanceId -or !$metadata.runtimeInstanceId) { throw 'Supervisor ownership metadata is incomplete.' }
$components = @('assetHub','gateway','dsh','proxy')
foreach ($component in $components) {
  if (!($metadata.processes | Where-Object { $_.component -eq $component -and $_.managedState -eq 'running' })) { throw "Refusing shutdown: $component is not confirmed running." }
}

$protected = [IO.File]::ReadAllBytes($credentialPath)
$plain = $null; $authJson = $null; $auth = $null; $process = $null
try {
  Add-Type -AssemblyName System.Security
  $plain = [Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [Security.Cryptography.DataProtectionScope]::LocalMachine)
  $authJson = [Text.Encoding]::UTF8.GetString($plain)
  $auth = $authJson | ConvertFrom-Json
  if (!$auth.username -or !$auth.password) { throw 'Protected staging admin credential is invalid.' }
  $nodePath = Join-Path $root 'toolchains\node-v22.23.3-win-x64\node.exe'
  $clientPath = Join-Path $PSScriptRoot 'staging-admin-shutdown-client.mjs'
  $caPath = 'D:\UED-Asset-Hub-Staging\credentials\mkcert-ca\rootCA.pem'
  if (!(Test-Path -LiteralPath $nodePath) -or !(Test-Path -LiteralPath $clientPath) -or !(Test-Path -LiteralPath $caPath)) { throw 'Staging HTTPS shutdown client prerequisites are missing.' }
  $start = New-Object System.Diagnostics.ProcessStartInfo
  $start.FileName = $nodePath
  $start.Arguments = '"' + $clientPath + '"'
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardInput = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $start.EnvironmentVariables['NODE_EXTRA_CA_CERTS'] = $caPath
  $start.EnvironmentVariables['UED_STAGING_ORIGIN'] = 'https://172.17.1.100:4443'
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $start
  if (!$process.Start()) { throw 'Staging HTTPS shutdown client could not start.' }
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process.StandardInput.WriteLine(($auth | ConvertTo-Json -Compress))
  $process.StandardInput.Close()
  $auth.password = ''; $auth = $null; $authJson = $null
  if (!$process.WaitForExit(60000)) { $process.Kill(); throw 'Staging HTTPS shutdown client exceeded its bounded wait.' }
  $clientOutput = $stdoutTask.Result
  $clientError = $stderrTask.Result
  foreach ($line in @($clientOutput -split "`r?`n") + @($clientError -split "`r?`n")) {
    if ($line -match '^(TLS_CA_FILE_SHA256|TLS_CA_FINGERPRINT_SHA256|HTTPS_ADMIN_LOGIN|SECURE_SESSION_COOKIE|HTTPS_AUTHENTICATED_SESSION|HTTPS_LOGIN_PROBE_ONLY|SUPERVISOR_SHUTDOWN_HTTP|SUPERVISOR_SHUTDOWN_STATUS|STAGING_HTTPS_CLIENT_PHASE|STAGING_HTTPS_CLIENT_ERROR)=') { Write-Output $line }
  }
  if ($process.ExitCode -ne 0) { throw 'Staging HTTPS shutdown authorization failed; no shutdown request was accepted.' }
} finally {
  if ($process) { $process.Dispose() }
  if ($plain) { [Array]::Clear($plain,0,$plain.Length) }
  if ($protected) { [Array]::Clear($protected,0,$protected.Length) }
  $auth = $null; $authJson = $null
}

$stopped=$false
for ($i=0; $i -lt $TimeoutSeconds; $i++) {
  if (!(Get-NetTCPConnection -State Listen -LocalPort $runtimePorts -ErrorAction SilentlyContinue) -and !(Test-Path -LiteralPath $lockPath)) { $stopped=$true; break }
  Start-Sleep -Seconds 1
}
if (!$stopped) { write-Evidence @{type='supervisor-stop';status='STOP_TIMEOUT';at=(Get-Date).ToUniversalTime().ToString('o');supervisorGraceful=$false}; throw 'Supervisor shutdown exceeded its bounded wait; no unverified process was killed.' }

$finalMetadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
$events = @(Get-Content -LiteralPath $lifecyclePath -Tail 300 | ForEach-Object { try { $_ | ConvertFrom-Json } catch { $null } } | Where-Object { $_ })
$componentResults = @{}
foreach ($component in $components) {
  $record = $finalMetadata.processes | Where-Object { $_.component -eq $component } | Select-Object -Last 1
  $exitEvent = $events | Where-Object { $_.component -eq $component -and $_.status -eq 'exit' -and $_.generation -eq $record.generation } | Select-Object -Last 1
  $fallback = $record.convergence.fallback
  $exitZero = [bool]($exitEvent -and $exitEvent.exitCode -eq 0 -and !$exitEvent.exitSignal)
  $helperStillRunning = [bool]($record.jobOwnership.helperPid -and (Get-CimInstance Win32_Process -Filter "ProcessId=$($record.jobOwnership.helperPid)"))
  $ownedProcessCleanup = [bool]($record.jobOwnership.helperExited -eq $true -and !$helperStillRunning)
  $jobCountZero = [bool]($record.convergence.activeProcessCount -eq 0 -and (!$fallback.used -or $fallback.activeProcessCountAfter -eq 0))
  $gracefulPass = [bool]($record.managedState -eq 'exited' -and $record.graceful.outcome -eq 'accepted' -and $record.graceful.completedAt -and $record.convergence.rootExited -and $record.convergence.portsReleased -and $record.convergence.pipeClosed -and !$fallback.used -and $ownedProcessCleanup -and $jobCountZero -and $exitZero)
  $fallbackPass = [bool]($record.managedState -eq 'exited' -and $fallback.used -and $fallback.outcome -eq 'completed' -and $fallback.ownershipVerifiedAt -and $fallback.activeProcessCountAfter -eq 0 -and $fallback.helperExited -and $fallback.rootExited -and $fallback.portsReleased -and $ownedProcessCleanup -and $jobCountZero -and $exitZero)
  $componentResults[$component] = @{ pass=[bool]($gracefulPass -or $fallbackPass); gracefulPass=$gracefulPass; safeFallbackPass=$fallbackPass; jobActiveCountZero=$jobCountZero; ownedProcessCleanupPass=$ownedProcessCleanup; exitCode=$exitEvent.exitCode; exitSignal=$exitEvent.exitSignal; gracefulOutcome=$record.graceful.outcome; fallbackOutcome=$fallback.outcome; fallbackReasonCode=$fallback.reasonCode; completedAt=$record.graceful.completedAt; portsReleased=$record.convergence.portsReleased; pipeClosed=$record.convergence.pipeClosed; activeProcessCount=$record.convergence.activeProcessCount; activeProcessCountAfter=$fallback.activeProcessCountAfter }
}
$handshake = [bool](($events | Where-Object { $_.operation -eq 'shutdown' -and $_.phase -eq 'runtime-control:shutdown' -and $_.status -eq 'accepted' }) -and ($events | Where-Object { $_.phase -eq 'managed-shutdown' -and $_.status -eq 'managed-components-converged' }) -and ($events | Where-Object { $_.phase -eq 'managed-shutdown' -and $_.status -eq 'finalization-completed' }))
$allComponentsStopped = @($componentResults.Values | Where-Object { $_.pass -ne $true }).Count -eq 0
$graceful = $handshake -and $allComponentsStopped -and @($componentResults.Values | Where-Object { $_.safeFallbackPass }).Count -eq 0 -and !(Test-Path -LiteralPath $lockPath)
$safeFallback = $handshake -and $allComponentsStopped -and @($componentResults.Values | Where-Object { $_.safeFallbackPass }).Count -gt 0 -and !(Test-Path -LiteralPath $lockPath)
$edgeResult='not_listening'
$edgePid = Get-NetTCPConnection -State Listen -LocalPort 4443 -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess
if ($edgePid) {
  $edgeProcess = get-OwnedProcess ([int]$edgePid)
  if ($edgeProcess.CommandLine -notlike '*runtime\https\https-edge.cjs*') { throw 'Refusing cleanup: port 4443 is no longer owned by the staging HTTPS edge.' }
  Stop-Process -Id ([int]$edgePid) -Force
  for ($i=0; $i -lt 10 -and (Get-NetTCPConnection -State Listen -LocalPort 4443 -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Seconds 1 }
  if (Get-NetTCPConnection -State Listen -LocalPort 4443 -ErrorAction SilentlyContinue) { throw 'Staging HTTPS edge did not release port 4443.' }
  $edgeResult='FORCE_CLEANUP_EXTERNAL_TO_SUPERVISOR'
}
$summary = @{type='supervisor-stop';status=$(if($graceful){'GRACEFUL_SHUTDOWN_PASS'}elseif($safeFallback){'SAFE_FALLBACK_SHUTDOWN_PASS'}else{'SHUTDOWN_INCOMPLETE'});at=(Get-Date).ToUniversalTime().ToString('o');supervisorGraceful=$graceful;supervisorSafeFallback=$safeFallback;shutdownHandshake=$handshake;components=$componentResults;runtimePortsReleased=$true;supervisorLockReleased=!(Test-Path -LiteralPath $lockPath);httpsEdge=$edgeResult;httpsEdgeIsOutsideSupervisor=$true;metadataSha256=(Get-FileHash -LiteralPath $metadataPath -Algorithm SHA256).Hash}
write-Evidence $summary
Write-Output "SUPERVISOR_GRACEFUL_SHUTDOWN_PASS=$($graceful.ToString().ToLowerInvariant())"
Write-Output "SUPERVISOR_SAFE_FALLBACK_PASS=$($safeFallback.ToString().ToLowerInvariant())"
Write-Output "STAGING_JOB_ACTIVE_COUNT_ZERO_VERIFIED=$((@($componentResults.Values | Where-Object { $_.jobActiveCountZero -ne $true }).Count -eq 0).ToString().ToLowerInvariant())"
Write-Output "STAGING_OWNED_PROCESS_CLEANUP_PASS=$((@($componentResults.Values | Where-Object { $_.ownedProcessCleanupPass -ne $true }).Count -eq 0).ToString().ToLowerInvariant())"
if (!$graceful -and !$safeFallback) { throw 'Supervisor stopped, but its lifecycle handshake, ownership fallback, or component convergence checks failed.' }
