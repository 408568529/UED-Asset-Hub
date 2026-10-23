[CmdletBinding()]
param([ValidateSet('Start','Stop','Check')][string]$Action='Start')
$ErrorActionPreference='Stop'
$OutputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$package=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$node=Join-Path $package 'tools\node\node.exe'
if(-not(Test-Path -LiteralPath $node) -or (Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash.ToLowerInvariant() -ne '0d0f5e39f9f3d9587bc19f73eab3c2c9c4903fd02d6dbf9c853dd81b3d95fad4'){throw 'The complete pinned portable Node is missing. Extract the correct Windows ZIP again.'}
# Remove only this child's optional resolution/cache hooks. No system PATH/policy is changed.
foreach($name in @('NODE_OPTIONS','NODE_PATH','NODE_COMPILE_CACHE')){Remove-Item -LiteralPath ('Env:'+ $name) -ErrorAction SilentlyContinue}
$launcher=Join-Path $package 'tools\competition-launcher.mjs'
if($Action -eq 'Start' -and -not(Test-Path -LiteralPath (Join-Path $package 'installation.json'))){
  & $node $launcher Check $package
  if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
  Add-Type -AssemblyName System.Windows.Forms
  $folder=[Windows.Forms.FolderBrowserDialog]::new();$folder.Description='Choose an external data parent folder outside C:'
  try{if($folder.ShowDialog() -ne 'OK'){Write-Output 'Setup cancelled; no data created.';exit 1};$dataRoot=Join-Path $folder.SelectedPath 'UED-Asset-Hub-Data'}finally{$folder.Dispose()}
  $form=[Windows.Forms.Form]::new();$form.Text='UED Asset Hub - First administrator';$form.Width=460;$form.Height=280;$form.StartPosition='CenterScreen'
  $pathLabel=[Windows.Forms.Label]::new();$pathLabel.Text='New data directory: '+$dataRoot;$pathLabel.Left=15;$pathLabel.Top=12;$pathLabel.Width=410;$pathLabel.Height=40;$form.Controls.Add($pathLabel)
  $fields=@();$labels=@('Username','New password (12+ chars)','Confirm password')
  for($i=0;$i -lt 3;$i++){
    $label=[Windows.Forms.Label]::new();$label.Text=$labels[$i];$label.Left=15;$label.Top=60+36*$i;$label.Width=180;$form.Controls.Add($label)
    $field=[Windows.Forms.TextBox]::new();$field.Left=200;$field.Top=57+36*$i;$field.Width=220;if($i -eq 0){$field.Text='admin'}else{$field.UseSystemPasswordChar=$true};$form.Controls.Add($field);$fields+=,$field
  }
  $ok=[Windows.Forms.Button]::new();$ok.Text='Create and start';$ok.Left=170;$ok.Top=180;$ok.Width=150;$ok.DialogResult='OK';$form.Controls.Add($ok);$form.AcceptButton=$ok
  try{
    if($form.ShowDialog() -ne 'OK'){Write-Output 'Setup cancelled; no data created.';exit 1}
    if($fields[1].Text -cne $fields[2].Text){throw 'Passwords differ. No data was created.'}
    $setup=@{dataRoot=$dataRoot;username=$fields[0].Text;password=$fields[1].Text}|ConvertTo-Json -Compress
    $setup | & $node $launcher Init $package
    $setup=$null
    if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
  }finally{foreach($field in $fields){$field.Text=''};$form.Dispose()}
}
& $node $launcher $Action $package
exit $LASTEXITCODE
