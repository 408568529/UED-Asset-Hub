[CmdletBinding()]
param([ValidateSet('Inspect','Apply')][string]$Action='Inspect',[Parameter(Mandatory=$true)][string]$BindAddress,[ValidateRange(1024,65535)][int]$Port,[Parameter(Mandatory=$true)][string]$RuleName,[Parameter(Mandatory=$true)][string]$Program,[string]$KeyPath)
$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.Encoding]::UTF8
if($RuleName -notmatch '^UED V25 LAN [a-f0-9]{12} HTTPS [0-9]+$'){throw 'Invalid instance rule identity.'}
$ip=Get-NetIPAddress -AddressFamily IPv4 -IPAddress $BindAddress -ErrorAction Stop
$profile=Get-NetConnectionProfile -InterfaceIndex $ip.InterfaceIndex -ErrorAction Stop
if($profile.NetworkCategory -notin @('Private','DomainAuthenticated')){throw 'Public or unknown network is not permitted. Use a trusted Private/Domain LAN.'}
if($KeyPath){
 $item=Get-Item -LiteralPath $KeyPath -Force;if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Private key cannot be a link.'}
 $acl=Get-Acl -LiteralPath $KeyPath;$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin @($sid,'S-1-5-32-544')){throw 'Private key owner must be current account or Administrators.'}
 foreach($r in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($r.AccessControlType -eq 'Allow' -and $r.IdentityReference.Value -notin @($sid,'S-1-5-18','S-1-5-32-544')){throw 'Private key ACL must be limited to account, SYSTEM and Administrators.'}}
}
$rule=Get-NetFirewallRule -Name $RuleName -ErrorAction SilentlyContinue
if(!$rule -and $Action -eq 'Apply'){
 $principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
 if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Administrator privileges required after explicit confirmation.'}
 New-NetFirewallRule -Name $RuleName -DisplayName $RuleName -Direction Inbound -Action Allow -Enabled True -Protocol TCP -LocalPort $Port -LocalAddress $BindAddress -RemoteAddress LocalSubnet -Profile Domain,Private -Program $Program | Out-Null
 $rule=Get-NetFirewallRule -Name $RuleName -ErrorAction Stop
}
$ready=$false
if($rule){
 $ports=$rule|Get-NetFirewallPortFilter;$address=$rule|Get-NetFirewallAddressFilter;$app=$rule|Get-NetFirewallApplicationFilter
 $ready=($rule.Direction -eq 'Inbound' -and $rule.Action -eq 'Allow' -and $rule.Enabled -eq 'True' -and $rule.Profile.ToString() -eq 'Domain, Private' -and $ports.Protocol -eq 'TCP' -and "$($ports.LocalPort)" -eq "$Port" -and @($address.LocalAddress).Count -eq 1 -and $address.LocalAddress -contains $BindAddress -and @($address.RemoteAddress).Count -eq 1 -and $address.RemoteAddress -contains 'LocalSubnet' -and $app.Program -eq $Program)
 if(!$ready){throw 'Existing named rule differs from this installation plan; it will not be changed.'}
}
@{ready=$ready;network=$profile.NetworkCategory.ToString();ruleName=$RuleName;port=$Port;address=$BindAddress;scope='LocalSubnet';profiles='Domain,Private';requiresAdministrator=(!$ready)}|ConvertTo-Json -Compress
