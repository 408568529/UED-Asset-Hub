param(
  [string]$ProjectDir = (Split-Path -Parent $PSScriptRoot),
  [string]$TaskName = "UED Asset Hub Host Runner",
  [switch]$AtStartup
)

$ErrorActionPreference = "Stop"
$projectPath = [IO.Path]::GetFullPath($ProjectDir)
$runner = Join-Path $projectPath "scripts\启动 UED Asset Hub Host Runner.bat"

if (-not (Test-Path $runner)) {
  throw "未找到 Host Runner 启动脚本：$runner"
}

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$runner`"" -WorkingDirectory $projectPath
$trigger = if ($AtStartup) { New-ScheduledTaskTrigger -AtStartup } else { New-ScheduledTaskTrigger -AtLogOn }
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 0)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "已创建任务计划程序：$TaskName"
Write-Host "启动脚本：$runner"
Write-Host "可在任务计划程序中手动运行或停止该任务。"
