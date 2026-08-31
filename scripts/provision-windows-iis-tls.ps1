param([Parameter(Mandatory = $true)][string]$ContractPath, [Parameter(Mandatory = $true)][string]$Hostname, [Parameter(Mandatory = $true)][string]$Thumbprint, [ValidateSet('DryRun','Apply','Verify')][string]$Action = 'DryRun')
$ErrorActionPreference = 'Stop'; $contract = Get-Content -Raw -LiteralPath $ContractPath | ConvertFrom-Json
if ($contract.edge.upstream -ne 'http://127.0.0.1:3027' -or $contract.edge.httpsPort -ne 443 -or $contract.edge.httpPort -ne 'closed') { throw 'IIS edge contract mismatch.' }
$certificate = Get-ChildItem "Cert:\LocalMachine\My\$Thumbprint" -ErrorAction SilentlyContinue
if (!$certificate) { throw 'Configured certificate is missing.' }; if ($certificate.NotAfter -lt (Get-Date).AddDays($contract.tls.minimumRemainingDays)) { throw 'Certificate expires in fewer than 30 days.' }
if ($certificate.NotBefore -gt (Get-Date) -or $certificate.NotAfter -lt (Get-Date) -or !$certificate.HasPrivateKey) { throw 'Certificate validity/private-key check failed.' }
if ($certificate.EnhancedKeyUsageList.ObjectId.Value -notcontains $contract.tls.requiredEku) { throw 'Server Authentication EKU missing.' }
if ($certificate.DnsNameList.Unicode -notcontains $Hostname) { throw 'Certificate SAN does not contain configured hostname.' }
if ($Action -eq 'DryRun') { Write-Output "[DryRun] IIS $Hostname:443 -> $($contract.edge.upstream); LocalMachine\My=$Thumbprint"; exit 0 }
Import-Module WebAdministration
if ($Action -eq 'Apply') { if (!(Get-Website -Name $contract.edge.site -ErrorAction SilentlyContinue)) { New-Website -Name $contract.edge.site -Port 443 -PhysicalPath "$env:ProgramData\UEDAssetHub\iis-edge" -Force | Out-Null }; Remove-WebBinding -Name $contract.edge.site -Protocol http -ErrorAction SilentlyContinue; if (!(Get-WebBinding -Name $contract.edge.site -Protocol https -Port 443 -HostHeader $Hostname)) { New-WebBinding -Name $contract.edge.site -Protocol https -Port 443 -HostHeader $Hostname | Out-Null }; New-Item "IIS:\SslBindings\0.0.0.0!443!$Hostname" -Thumbprint $Thumbprint -SSLFlags 1 -Force | Out-Null }
if (!(Get-WebBinding -Name $contract.edge.site -Protocol https -Port 443 -HostHeader $Hostname)) { throw 'HTTPS 443 binding missing.' }
Write-Output '[Verify] IIS HTTPS binding contract passed; private-key ACL requires Block E effective evidence.'
