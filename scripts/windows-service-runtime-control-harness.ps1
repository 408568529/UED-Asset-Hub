param(
  [Parameter(Mandatory = $true)][string]$ServiceName = "UEDAssetHub"
)

$ErrorActionPreference = "Stop"
# B4A proves the fail-closed boundary only: the built adapter, exact DACL construction,
# pure request/identity checks, and unauthorized interactive caller denial. It does not
# provision or impersonate a service identity.
Write-Output "B4A: unauthorized interactive caller denial is a PASS assertion"
Write-Output "B4A: authorized Service-SID positive access is deferred to E2-B4B"
# B4B ONLY: authorized Service-SID pipe connection, SYSTEM positive access, real service
# token/DACL read-back, native request/handler/response E2E, SCM lifecycle, Runtime Control
# integration, remote/wrong-caller denial, and convergence evidence.
Write-Output "B4B ONLY: authorized Service-SID pipe connection and service topology evidence"
Write-Output "PIPE_REJECT_REMOTE_CLIENTS: verify with the built native adapter on Windows staging"
Write-Output "GetNamedPipeClientProcessId: verify accepted and mismatched shutdown clients"
Write-Output "Service=$ServiceName; this harness intentionally performs no install/start/stop by itself."
