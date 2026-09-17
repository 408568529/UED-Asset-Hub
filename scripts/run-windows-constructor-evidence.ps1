param([Parameter(Mandatory=$true)][string]$EvidenceDir,[Parameter(Mandatory=$true)][string]$WorkingDirectory,[Parameter(Mandatory=$true)][string]$Executable,[Parameter(Mandatory=$true)][string[]]$Arguments)
$ErrorActionPreference='Stop'
New-Item -ItemType Directory -Path $EvidenceDir -Force | Out-Null
$start=(Get-Date).ToUniversalTime().ToString('o'); $stdout=Join-Path $EvidenceDir 'constructor.stdout.log'; $stderr=Join-Path $EvidenceDir 'constructor.stderr.log'
[pscustomobject]@{schemaVersion=1;status='RUNNING';startedAt=$start;workingDirectory=$WorkingDirectory;executable=$Executable;arguments=$Arguments}|ConvertTo-Json -Depth 4|Set-Content (Join-Path $EvidenceDir 'constructor-execution.json') -Encoding UTF8
$process=Start-Process -FilePath $Executable -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -Wait
$result=[pscustomobject]@{schemaVersion=1;status=if($process.ExitCode -eq 0){'PASS'}else{'FAIL'};startedAt=$start;endedAt=(Get-Date).ToUniversalTime().ToString('o');exitCode=$process.ExitCode;workingDirectory=$WorkingDirectory;executable=$Executable;arguments=$Arguments;stdoutSha256=(Get-FileHash $stdout -Algorithm SHA256).Hash.ToLowerInvariant();stderrSha256=(Get-FileHash $stderr -Algorithm SHA256).Hash.ToLowerInvariant()}
$result|ConvertTo-Json -Depth 4|Set-Content (Join-Path $EvidenceDir 'constructor-execution.json') -Encoding UTF8
exit $process.ExitCode
