[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Path,[switch]$Initialize,[switch]$ProtectLogin)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath($Path)
if((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Private configuration root cannot be a link.'}
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
if($Initialize){
  if(-not(Test-Path -LiteralPath (Join-Path $root 'config\setup-receipt.json')) -or (Test-Path -LiteralPath (Join-Path $root 'config\host-login.json'))){throw 'ACL initialization is permitted only for a newly prepared installation.'}
  $acl=[Security.AccessControl.DirectorySecurity]::new()
  $acl.SetSecurityDescriptorSddlForm(('O:{0}G:{0}D:P(A;OICI;FA;;;{0})(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)' -f $sid))
  Set-Acl -LiteralPath $root -AclObject $acl
  Set-Acl -LiteralPath (Join-Path $root 'config') -AclObject $acl
}
$targets=@($root,(Join-Path $root 'config'))
if(-not $ProtectLogin -and (Test-Path -LiteralPath (Join-Path $root 'config\host-login.json'))){$targets+=,(Join-Path $root 'config\host-login.json')}
foreach($target in $targets){
  if((Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Private configuration cannot be redirected by a link.'}
  $acl=Get-Acl -LiteralPath $target
  if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid){throw 'Private configuration must belong to the current Windows account.'}
  foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
    if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @($sid,'S-1-5-18','S-1-5-32-544')){throw 'Private configuration has access beyond the current account, SYSTEM and Administrators.'}
  }
}

if($ProtectLogin){
  $login=Join-Path $root 'config\host-login.json'
  if(-not(Test-Path -LiteralPath (Join-Path $root 'config\setup-receipt.json')) -or (Get-Item -LiteralPath $login -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Only a newly created regular administrator configuration may be protected.'}
  $acl=[Security.AccessControl.FileSecurity]::new()
  $acl.SetSecurityDescriptorSddlForm(('O:{0}G:{0}D:P(A;;FA;;;{0})(A;;FA;;;SY)(A;;FA;;;BA)' -f $sid))
  Set-Acl -LiteralPath $login -AclObject $acl
}
