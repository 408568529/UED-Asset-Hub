param(
  [Parameter(Mandatory = $true)][string]$ContractPath,
  [Parameter(Mandatory = $true)][string]$Hostname,
  [Parameter(Mandatory = $true)][string]$Thumbprint,
  [Parameter(Mandatory = $true)][string]$CredentialBundlePath,
  [Parameter(Mandatory = $true)][string]$CredentialHelperPath,
  [string]$PrivateRemoteAddress = 'LocalSubnet',
  [string]$Root = 'D:\UED-Asset-Hub', [string]$DataRoot = 'D:\UED-Asset-Data', [string]$BackupRoot = 'E:\UED-Asset-Backup'
)
$ErrorActionPreference = "Stop"
# Block E only: this script verifies the effective target state and never provisions it.
$contract = Get-Content -Raw -LiteralPath $ContractPath | ConvertFrom-Json
$scriptRoot = Split-Path -Parent $PSCommandPath
& (Join-Path $scriptRoot 'provision-windows-security-foundation.ps1') -ContractPath $ContractPath -Action Verify -Root $Root -DataRoot $DataRoot -BackupRoot $BackupRoot
& (Join-Path $scriptRoot 'provision-windows-iis-tls.ps1') -ContractPath $ContractPath -Hostname $Hostname -Thumbprint $Thumbprint -Action Verify
& (Join-Path $scriptRoot 'provision-windows-firewall.ps1') -ContractPath $ContractPath -PrivateRemoteAddress $PrivateRemoteAddress -Action Verify
if (!(Test-Path -LiteralPath $CredentialHelperPath) -or !(Test-Path -LiteralPath $CredentialBundlePath)) { throw 'DPAPI helper or credential bundle is missing.' }
$bundle = & $CredentialHelperPath --operation unprotect --input $CredentialBundlePath
if ($LASTEXITCODE -ne 0 -or !$bundle) { throw 'DPAPI machine-scope decryptability check failed.' }
$parsedBundle = $bundle | ConvertFrom-Json
if ($parsedBundle.schemaVersion -ne 1 -or !$parsedBundle.credentials) { throw 'DPAPI credential bundle schema check failed.' }
$certificate = Get-ChildItem "Cert:\LocalMachine\My\$Thumbprint" -ErrorAction Stop
$container = $certificate.PrivateKey.CspKeyContainerInfo.UniqueKeyContainerName
if (!$container) { throw 'Private-key ACL proof requires a CAPI machine-key certificate.' }
$privateKey = Join-Path "$env:ProgramData\Microsoft\Crypto\RSA\MachineKeys" $container
$serviceAccess = (Get-Acl -LiteralPath $privateKey).Access | Where-Object { $_.IdentityReference.Value -eq $contract.service.account -and $_.AccessControlType -eq 'Allow' }
if ($serviceAccess) { throw 'Service SID must not read the TLS private key.' }
Write-Output 'Block E native security evidence passed: Service SID, DATA ACL, DPAPI decryptability, IIS/TLS, TLS key isolation, and firewall effective rules.'
