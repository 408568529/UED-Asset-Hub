param([ValidateRange(10,180)][int]$TimeoutSeconds = 120)

$ErrorActionPreference = 'Stop'
$root = 'D:\UED-Asset-Hub-Staging\staging\internal-stable-security-227da49-20261010-0211Z'
$settingsPath = 'D:\UED-Asset-Hub-Staging\credentials\internal-stable-security-227da49-https\staging-settings.json'
$credentialPath = 'D:\UED-Asset-Hub-Staging\credentials\internal-stable-security-227da49-https\staging-admin-auth.dpapi'
$ports = @(3037,3038,3080,3081,3082,4443)
$settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
$credentialHashBefore = (Get-FileHash -LiteralPath $credentialPath -Algorithm SHA256).Hash
$stopScript = Join-Path $root 'scripts\windows\staging\stop-staging-hub-agent.ps1'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$evidence = Join-Path $root "logs\agent-ux-supervisor-restart-$stamp.ndjson"

& $stopScript -TimeoutSeconds 90
if (Get-NetTCPConnection -State Listen -LocalPort $ports -ErrorAction SilentlyContinue) { throw 'A target port remains occupied after staging stop.' }
Start-ScheduledTask -TaskName 'UEDAssetHubStagingHttps'

$ready = $false
$result = @{}
for ($i = 0; $i -lt $TimeoutSeconds; $i++) {
  Start-Sleep -Seconds 1
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $ports -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort -Unique)
  if (@($ports | Where-Object { $listeners -notcontains $_ }).Count -gt 0) { continue }
  try {
    $origin = 'https://172.17.1.100:4443'
    $hub = Invoke-WebRequest -Uri "$origin/api/auth/session" -UseBasicParsing -TimeoutSec 3
    $proxy = Invoke-RestMethod -Uri 'http://127.0.0.1:3081/healthz' -TimeoutSec 3
    $headers = @{ Origin = 'http://127.0.0.1:3080'; Referer = 'http://127.0.0.1:3080/' }
    $sessionBody = @{ type = 'client-request'; rpcId = 'restart-session'; method = 'session.list'; payload = @{} } | ConvertTo-Json -Depth 8 -Compress
    $session = Invoke-RestMethod -Uri 'http://127.0.0.1:3080/api/session.list' -Method Post -Headers $headers -ContentType 'application/json' -Body $sessionBody -TimeoutSec 5
    $credentialBody = @{ type = 'client-request'; rpcId = 'restart-credential'; method = 'credentials.describe'; payload = @{ refs = @('DEEPSEEK_API_KEY') } } | ConvertTo-Json -Depth 8 -Compress
    $credential = Invoke-RestMethod -Uri 'http://127.0.0.1:3080/api/credentials.describe' -Method Post -Headers $headers -ContentType 'application/json' -Body $credentialBody -TimeoutSec 5
    $result = @{ hub = ($hub.StatusCode -eq 200); proxy = ($proxy.ok -eq $true); dshSession = ($session.result.ok -eq $true); deepseekCredentialConfigured = ($credential.result.value.credentials.DEEPSEEK_API_KEY.configured -eq $true) }
    if (!$result.hub -or !$result.proxy -or !$result.dshSession -or !$result.deepseekCredentialConfigured) { throw 'Post-restart readiness probe failed.' }
    $ready = $true
    break
  } catch {
    if ($i -eq ($TimeoutSeconds - 1)) { throw }
  }
}
if (!$ready) { throw 'Staging did not recover before the readiness timeout.' }

$credentialHashAfter = (Get-FileHash -LiteralPath $credentialPath -Algorithm SHA256).Hash
if ($credentialHashBefore -ne $credentialHashAfter) { throw 'Protected admin credential changed during restart.' }
$summary = @{ type = 'staging-restart'; status = 'PASS'; at = (Get-Date).ToUniversalTime().ToString('o'); ports = '3037,3038,3080,3081,3082,4443'; hub = 'PASS'; proxy = 'PASS'; dshSession = 'PASS'; deepseekCredentialConfigured = $true; adminCredentialHashUnchanged = $true; task = (Get-ScheduledTask -TaskName 'UEDAssetHubStagingHttps').State }
New-Item -ItemType Directory -Path (Split-Path $evidence) -Force | Out-Null
$summary | ConvertTo-Json -Compress | Add-Content -LiteralPath $evidence -Encoding utf8
$summary | ConvertTo-Json -Compress
Write-Output "EVIDENCE=$evidence"
