param(
  [Parameter(Mandatory = $true)][string]$ContractPath,
  [ValidateSet('DryRun','Apply','Verify')][string]$Action = 'DryRun',
  [string]$Root = 'D:\UED-Asset-Hub', [string]$DataRoot = 'D:\UED-Asset-Data', [string]$BackupRoot = 'E:\UED-Asset-Backup'
)
$ErrorActionPreference = "Stop"
$contract = Get-Content -Raw -LiteralPath $ContractPath | ConvertFrom-Json
if ($contract.service.account -ne 'NT SERVICE\UEDAssetHub' -or $contract.service.sidType -ne 'unrestricted') { throw 'Service identity contract mismatch.' }
if ($contract.credentials.provider -ne 'dpapi' -or $contract.credentials.scope -ne 'machine') { throw 'Credential contract mismatch.' }
if ($contract.edge.upstream -ne 'http://127.0.0.1:3027' -or $contract.edge.httpsPort -ne 443 -or $contract.edge.httpPort -ne 'closed') { throw 'IIS edge contract mismatch.' }
$sid = $contract.service.account
$admins = 'BUILTIN\Administrators'
$paths = @{ service='RX'; releases='RX'; current='RX'; 'dsh-source'='RX'; 'agent-runtime'='M'; 'asset-hub-runtime'='M'; 'training-media'='M'; logs='M'; config='R'; credentials='R' }
function Assert-SafePath([string]$Value, [string]$ExpectedRoot) {
  if ($Value.StartsWith('\\')) { throw "UNC paths are forbidden: $Value" }
  $full = [IO.Path]::GetFullPath($Value); $root = [IO.Path]::GetFullPath($ExpectedRoot)
  if (-not ($full.Equals($root, [StringComparison]::OrdinalIgnoreCase) -or $full.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase))) { throw "Path escapes expected root: $Value" }
  if (Test-Path -LiteralPath $full) { if ((Get-Item -Force -LiteralPath $full).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse point is forbidden: $full" } }
  return $full
}
function Plan([string]$Text) { Write-Output "[$Action] $Text" }
function Assert-NoServiceWrite([string]$Path) {
  $writeMask = [System.Security.AccessControl.FileSystemRights]::WriteData -bor [System.Security.AccessControl.FileSystemRights]::AppendData -bor [System.Security.AccessControl.FileSystemRights]::CreateDirectories -bor [System.Security.AccessControl.FileSystemRights]::Delete -bor [System.Security.AccessControl.FileSystemRights]::ChangePermissions -bor [System.Security.AccessControl.FileSystemRights]::TakeOwnership
  $writeAccess = (Get-Acl -LiteralPath $Path).Access | Where-Object { $_.IdentityReference.Value -eq $sid -and $_.AccessControlType -eq 'Allow' -and ($_.FileSystemRights -band $writeMask) -ne 0 }
  if ($writeAccess) { throw "Service SID has forbidden write access: $Path" }
}
function Assert-NoServiceAccess([string]$Path) {
  $access = (Get-Acl -LiteralPath $Path).Access | Where-Object { $_.IdentityReference.Value -eq $sid -and $_.AccessControlType -eq 'Allow' }
  if ($access) { throw "Service SID has forbidden access: $Path" }
}
function Grant-Contract([string]$Path, [string]$Right) {
  if ($Action -eq 'DryRun') { Plan "ACL $Path => $sid:$Right; SYSTEM:F; $admins:F"; return }
  if ($Action -eq 'Apply') { & icacls.exe $Path /remove:g $sid | Out-Null; if ($LASTEXITCODE -ne 0) { throw "icacls removal failed for $Path" }; & icacls.exe $Path /grant:r "$sid:($Right)" /grant "$admins:(F)" /grant 'SYSTEM:(F)' | Out-Null; if ($LASTEXITCODE -ne 0) { throw "icacls failed for $Path" } }
  $acl = Get-Acl -LiteralPath $Path; if (-not ($acl.Access | Where-Object { $_.IdentityReference.Value -eq $sid -and $_.AccessControlType -eq 'Allow' })) { throw "Missing Service SID ACL on $Path" }
}
$service = Get-CimInstance Win32_Service -Filter "Name='UEDAssetHub'" -ErrorAction SilentlyContinue
if ($Action -eq 'Verify' -and (!$service -or $service.StartName -ne $sid)) { throw 'Service identity is not NT SERVICE\UEDAssetHub.' }
if ($Action -eq 'Apply') { & sc.exe sidtype UEDAssetHub unrestricted | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'Unable to set Service SID unrestricted.' } }
foreach ($name in $paths.Keys) { $target = Assert-SafePath (Join-Path $Root $name) $Root; if ($Action -eq 'Apply' -and -not (Test-Path $target)) { New-Item -ItemType Directory -Path $target -Force | Out-Null }; Grant-Contract $target $paths[$name] }
$staging = Assert-SafePath (Join-Path $Root 'staging') $Root
if ($Action -eq 'Verify') { Assert-NoServiceAccess $staging }
$formal = Assert-SafePath $DataRoot $DataRoot
if ($Action -eq 'Apply' -and -not (Test-Path $formal)) { throw 'Formal DATA root must already exist; tooling never initializes DATA.' }
Grant-Contract $formal 'RX'
Assert-NoServiceWrite $formal
foreach ($child in $contract.formalDataWritableChildren) { $target = Assert-SafePath (Join-Path $formal $child) $formal; if ($Action -eq 'Apply' -and -not (Test-Path $target)) { throw "Approved Formal DATA child missing: $child" }; Grant-Contract $target 'M' }
$backup = Assert-SafePath $BackupRoot $BackupRoot
if ($Action -eq 'Verify') { Assert-NoServiceAccess $backup }
Plan 'ACL contract complete: no recursive DATA root Modify, no Everyone:F, no Users:M.'
