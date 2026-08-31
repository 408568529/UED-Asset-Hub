param(
  [Parameter(Mandatory = $true)][string]$ServiceName = "UEDAssetHub"
)

$ErrorActionPreference = "Stop"
# Block E only: install/start service, then record SCM state, ready state, effective
# pipe DACL, local unauthorized denial, remote rejection, stale capability denial,
# managed stop convergence, released ports/pipes/lock, restart policy, and nested Job evidence.
Write-Output "PIPE_REJECT_REMOTE_CLIENTS: verify with the built native adapter on Windows staging"
Write-Output "GetNamedPipeClientProcessId: verify accepted and mismatched shutdown clients"
Write-Output "Service=$ServiceName; this harness intentionally performs no install/start/stop by itself."
