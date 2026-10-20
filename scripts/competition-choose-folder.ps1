$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
$dialog=New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description='Choose a data directory or parent outside the program folder'
if($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);[Console]::Write($dialog.SelectedPath)}
$dialog.Dispose()
