[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Path,[switch]$Initialize,[switch]$ProtectState)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath($Path)
if((Split-Path -Leaf $root) -ne '.launch-center' -or (Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Unexpected control directory'}
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
if($Initialize){
 if(@(Get-ChildItem -LiteralPath $root -Force).Count){throw 'Only a newly created empty control directory may be protected'}
 $acl=[Security.AccessControl.DirectorySecurity]::new()
 $acl.SetSecurityDescriptorSddlForm(('O:{0}G:{0}D:P(A;OICI;FA;;;{0})(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)' -f $sid))
 Set-Acl -LiteralPath $root -AclObject $acl
}
if($ProtectState){
 $base=Get-Acl -LiteralPath $root
 if($base.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid){throw 'Control directory belongs to another account'}
 foreach($rule in $base.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @($sid,'S-1-5-18','S-1-5-32-544')){throw 'Control directory is not private'}}
 $target=Join-Path $root 'control.json';$item=Get-Item -LiteralPath $target -Force
 if($item.Length -ne 0 -or $item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Only the newly claimed empty state file may be protected'}
 $acl=[Security.AccessControl.FileSecurity]::new();$acl.SetSecurityDescriptorSddlForm(('O:{0}G:{0}D:P(A;;FA;;;{0})(A;;FA;;;SY)(A;;FA;;;BA)' -f $sid));Set-Acl -LiteralPath $target -AclObject $acl
}
$targets=@($root);$state=Join-Path $root 'control.json';if(Test-Path -LiteralPath $state){$targets+=,$state}
foreach($target in $targets){
 if((Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Control paths cannot be redirected'}
 $acl=Get-Acl -LiteralPath $target
 if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid){throw 'Control state belongs to another account'}
 foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
  if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @($sid,'S-1-5-18','S-1-5-32-544')){throw 'Control state is not private'}
 }
}
