param([ValidateRange(10,180)][int]$TimeoutSeconds = 90)

$ErrorActionPreference = 'Stop'
$root = 'D:\UED-Asset-Hub-Staging\staging\internal-stable-security-227da49-20261010-0211Z'
$settingsPath = 'D:\UED-Asset-Hub-Staging\credentials\internal-stable-security-227da49-https\staging-settings.json'
$credentialPath = 'D:\UED-Asset-Hub-Staging\credentials\internal-stable-security-227da49-https\staging-admin-auth.dpapi'
$runtimePorts = @(3037,3038,3080,3081,3082)
$allPorts = @($runtimePorts + 4443)
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$evidence = Join-Path $root "logs\agent-ux-supervisor-stop-$stamp.ndjson"
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
  $edge = $listeners | Where-Object { $_.LocalPort -eq 4443 } | Select-Object -First 1
  $edgeResult = 'not_listening'
  if ($edge) {
    $edgeProcess = get-OwnedProcess ([int]$edge.OwningProcess)
    if ($edgeProcess.CommandLine -notlike '*runtime\https\https-edge.cjs*') { throw 'Refusing cleanup: port 4443 is not owned by the staging HTTPS edge.' }
    Stop-Process -Id ([int]$edge.OwningProcess) -Force
    for ($i=0; $i -lt 10 -and (Get-NetTCPConnection -State Listen -LocalPort 4443 -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Seconds 1 }
    if (Get-NetTCPConnection -State Listen -LocalPort 4443 -ErrorAction SilentlyContinue) { throw 'Staging HTTPS edge did not release port 4443.' }
    $edgeResult = 'FORCE_CLEANUP_EXTERNAL_TO_SUPERVISOR'
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
$plain = $null; $authJson = $null; $auth = $null; $loginBody = ''
try {
  Add-Type -AssemblyName System.Security
  $plain = [Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [Security.Cryptography.DataProtectionScope]::LocalMachine)
  $authJson = [Text.Encoding]::UTF8.GetString($plain)
  $auth = $authJson | ConvertFrom-Json
  if (!$auth.username -or !$auth.password) { throw 'Protected staging admin credential is invalid.' }
  $web = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $origin = 'https://172.17.1.100:4443'
  $headers = @{ Origin=$origin; Referer="$origin/agent" }
  $loginBody = @{ username=$auth.username; password=$auth.password } | ConvertTo-Json -Compress
  $login = Invoke-WebRequest -Uri "$origin/api/auth/login" -Method Post -Headers $headers -ContentType 'application/json' -Body $loginBody -WebSession $web -UseBasicParsing -TimeoutSec 15
  if ($login.StatusCode -ne 200) { throw 'Staging admin authentication failed.' }
  $auth.password = ''; $auth = $null; $authJson = $null; $loginBody = ''
  $shutdown = Invoke-WebRequest -Uri "$origin/api/staging-shutdown" -Method Post -Headers $headers -ContentType 'application/json' -Body '{}' -WebSession $web -UseBasicParsing -TimeoutSec 15
  if ($shutdown.StatusCode -ne 202) { throw 'Staging Supervisor did not accept the shutdown request.' }
} finally {
  if ($plain) { [Array]::Clear($plain,0,$plain.Length) }
  if ($protected) { [Array]::Clear($protected,0,$protected.Length) }
  $loginBody=''; $authJson=$null; $auth=$null
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
  $exitEvent = $events | Where-Object { $_.component -eq $component -and $_.status -eq 'exit' -and $_.operation -eq 'shutdown' } | Select-Object -Last 1
  $componentResults[$component] = @{ pass=[bool]($record.managedState -eq 'exited' -and $record.graceful.outcome -eq 'accepted' -and $record.graceful.completedAt -and $record.convergence.rootExited -and $record.convergence.portsReleased -and $record.convergence.pipeClosed -and $exitEvent -and $exitEvent.exitCode -eq 0); exitCode=$exitEvent.exitCode; exitSignal=$exitEvent.exitSignal; gracefulOutcome=$record.graceful.outcome; completedAt=$record.graceful.completedAt; portsReleased=$record.convergence.portsReleased; pipeClosed=$record.convergence.pipeClosed }
}
$handshake = [bool](($events | Where-Object { $_.operation -eq 'shutdown' -and $_.phase -eq 'runtime-control:shutdown' -and $_.status -eq 'accepted' }) -and ($events | Where-Object { $_.phase -eq 'managed-shutdown' -and $_.status -eq 'managed-components-converged' }) -and ($events | Where-Object { $_.phase -eq 'managed-shutdown' -and $_.status -eq 'finalization-completed' }))
$graceful = $handshake -and (@($componentResults.Values | Where-Object { $_.pass -ne $true }).Count -eq 0) -and !(Test-Path -LiteralPath $lockPath)
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
$summary = @{type='supervisor-stop';status=$(if($graceful){'GRACEFUL_SHUTDOWN_PASS'}else{'GRACEFUL_SHUTDOWN_FAIL'});at=(Get-Date).ToUniversalTime().ToString('o');supervisorGraceful=$graceful;shutdownHandshake=$handshake;components=$componentResults;runtimePortsReleased=$true;supervisorLockReleased=!(Test-Path -LiteralPath $lockPath);httpsEdge=$edgeResult;httpsEdgeIsOutsideSupervisor=$true;metadataSha256=(Get-FileHash -LiteralPath $metadataPath -Algorithm SHA256).Hash}
write-Evidence $summary
if (!$graceful) { throw 'Supervisor stopped, but its lifecycle handshake or component convergence checks failed.' }
