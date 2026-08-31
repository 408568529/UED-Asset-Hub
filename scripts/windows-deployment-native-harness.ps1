param([Parameter(Mandatory = $true)][string]$DeploymentRoot, [Parameter(Mandatory = $true)][string]$DataRoot)
$ErrorActionPreference = 'Stop'
# Block E only. This harness verifies, but never fabricates, Windows Server 2025 evidence.
Write-Output 'Phase 1 Environment: OS, x64, NTFS, fixed drives, Node, helper hashes, and production paths.'
Write-Output 'Phase 2 Security: Service SID, ACL, DPAPI, pipe DACL, IIS/TLS, and firewall.'
Write-Output 'Phase 3 Runtime: SCM stop/start, Job ownership, graceful convergence, ports, pipes, metadata, and locks.'
Write-Output 'Phase 4 Deployment: stage, manifest/hash, bounded current Junction switch, failed upgrade, and compatible rollback.'
Write-Output 'Phase 5 Network: 443, WebSocket, SSE, stream/upload/download, and internal-port isolation.'
Write-Output 'Phase 6 Agent: DSH, credentials, MCP, session, shutdown/recovery.'
Write-Output 'Phase 7 Evidence: hashes, logs, clean terminal state. No Formal DATA migration or restore is permitted.'
