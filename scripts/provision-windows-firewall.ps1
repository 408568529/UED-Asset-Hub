param([Parameter(Mandatory = $true)][string]$ContractPath, [string]$PrivateRemoteAddress = 'LocalSubnet', [ValidateSet('DryRun','Apply','Verify')][string]$Action = 'DryRun')
$ErrorActionPreference = 'Stop'; $contract = Get-Content -Raw -LiteralPath $ContractPath | ConvertFrom-Json
if ($PrivateRemoteAddress -eq 'Any') { throw 'Private approved LAN scope cannot be Any.' }; $prefix = 'UED Asset Hub '
function Ensure-Rule([string]$Name, [string]$Direction, [string]$ActionValue, [string]$Ports, [string]$Profiles, [string]$Remote = 'Any') {
  if ($Action -eq 'DryRun') { Write-Output "[DryRun] $Name $Direction $ActionValue TCP/$Ports $Profiles $Remote"; return }
  if ($Action -eq 'Apply') { Get-NetFirewallRule -DisplayName $Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule; New-NetFirewallRule -DisplayName $Name -Direction $Direction -Action $ActionValue -Protocol TCP -LocalPort $Ports -Profile $Profiles -RemoteAddress $Remote | Out-Null }
  $rule = Get-NetFirewallRule -DisplayName $Name -ErrorAction SilentlyContinue
  if (!$rule) { throw "Firewall rule missing: $Name" }
  $actualProfiles = @($rule.Profile.ToString().Split(',') | ForEach-Object { $_.Trim() })
  $expectedProfiles = @($Profiles.Split(',') | ForEach-Object { $_.Trim() })
  if ($rule.Direction -ne $Direction -or $rule.Action -ne $ActionValue -or (Compare-Object $actualProfiles $expectedProfiles)) { throw "Firewall rule contract mismatch: $Name" }
  $portFilter = $rule | Get-NetFirewallPortFilter
  if ($portFilter.Protocol -ne 'TCP' -or $portFilter.LocalPort -ne $Ports) { throw "Firewall port contract mismatch: $Name" }
  $addressFilter = $rule | Get-NetFirewallAddressFilter
  if ($addressFilter.RemoteAddress -notcontains $Remote) { throw "Firewall remote scope contract mismatch: $Name" }
}
Ensure-Rule ($prefix + 'HTTPS Domain') Inbound Allow '443' Domain 'Any'; Ensure-Rule ($prefix + 'HTTPS Private') Inbound Allow '443' Private $PrivateRemoteAddress
foreach ($port in $contract.firewall.denyInbound) { Ensure-Rule ($prefix + "Deny TCP $port") Inbound Block "$port" 'Domain,Private,Public' 'Any' }
$publicAllow = Get-NetFirewallRule -Enabled True -Direction Inbound -Action Allow -PolicyStore ActiveStore | Where-Object { $_.Profile -match 'Public' -and (($_ | Get-NetFirewallPortFilter).LocalPort -eq '443') }
if ($publicAllow) { throw 'Public profile must not allow inbound HTTPS.' }
Write-Output '[Verify] Public profile has no HTTPS allow rule; internal ports are explicitly blocked.'
