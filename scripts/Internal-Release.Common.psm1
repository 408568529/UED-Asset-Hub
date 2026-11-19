Set-StrictMode -Version Latest

function Stop-InternalRelease([string]$Message) { throw "Internal release: $Message" }

function ConvertTo-SafeRelativePath([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value) -or $Value.Contains('\') -or $Value.StartsWith('/') -or $Value -match '^[A-Za-z]:') { Stop-InternalRelease 'archive path is not relative and canonical.' }
  $parts = $Value.Split('/')
  foreach ($part in $parts) {
    if ([string]::IsNullOrWhiteSpace($part) -or $part -in @('.', '..') -or $part.Contains(':') -or $part -match '[. ]$') { Stop-InternalRelease 'archive path contains an unsafe segment.' }
    if ($part -ieq '.git' -or ($part -match '^\.env(?:\.|$)' -and $part -ine '.env.example')) { Stop-InternalRelease 'archive contains a prohibited path.' }
    if ($part -match '\.(?:ts|tsx|mts|cts)$' -and $Value -notmatch '^node_modules/.*\.d\.(?:ts|mts|cts)$') { Stop-InternalRelease 'archive contains development TypeScript source.' }
    if ($part -match '\.map$') { Stop-InternalRelease 'archive contains a source map.' }
  }
  return ($parts -join '/')
}

function Get-UedArchiveManifest([string]$ZipPath, [string]$ExpectedSha256) {
  if (-not (Test-Path -LiteralPath $ZipPath -PathType Leaf)) { Stop-InternalRelease 'ZIP does not exist.' }
  Assert-NoReparseAncestor $ZipPath
  $zipHash = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($zipHash -ne $ExpectedSha256.ToLowerInvariant()) { Stop-InternalRelease 'ZIP SHA-256 does not match the supplied value.' }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead([System.IO.Path]::GetFullPath($ZipPath))
  try {
    $files = @{}
    $directories = @{}
    foreach ($entry in $archive.Entries) {
      $raw = $entry.FullName.Replace('\', '/')
      $isDirectory = $raw.EndsWith('/')
      if ($isDirectory) { $raw = $raw.Substring(0, $raw.Length - 1) }
      if (-not $raw) { Stop-InternalRelease 'ZIP contains an empty path.' }
      $relative = ConvertTo-SafeRelativePath $raw
      $mode = ($entry.ExternalAttributes -shr 16) -band 0xF000
      $attributes = $entry.ExternalAttributes -band 0xFFFF
      if ($mode -eq 0xA000 -or ($attributes -band [int][System.IO.FileAttributes]::ReparsePoint)) { Stop-InternalRelease 'ZIP contains a link or reparse point.' }
      if ($isDirectory) {
        $directories[$relative.ToLowerInvariant()] = $true
      } else {
        $key = $relative.ToLowerInvariant()
        if ($files.ContainsKey($key)) { Stop-InternalRelease 'ZIP contains duplicate or case-colliding entries.' }
        $files[$key] = $entry
      }
    }
    foreach ($key in $files.Keys) {
      $parts = $key.Split('/')
      for ($index = 1; $index -lt $parts.Length; $index++) {
        $parent = ($parts[0..($index - 1)] -join '/')
        if ($files.ContainsKey($parent)) { Stop-InternalRelease 'ZIP file path conflicts with a nested file path.' }
      }
      if ($directories.ContainsKey($key)) { Stop-InternalRelease 'ZIP path is both a file and a directory.' }
    }
    if (-not $files.ContainsKey('release-manifest.json')) { Stop-InternalRelease 'release-manifest.json is missing.' }
    $reader = [System.IO.StreamReader]::new($files['release-manifest.json'].Open(), [System.Text.Encoding]::UTF8, $true)
    try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    if ($manifest.schemaVersion -ne 1 -or $manifest.channel -ne 'INTERNAL_RELEASE' -or $manifest.releaseVersion -notmatch '^internal-[a-z0-9.-]{1,80}$' -or ($manifest.builtAtUtc -isnot [datetime] -and $manifest.builtAtUtc -notmatch '^\d{4}-\d\d-\d\dT') -or $manifest.source.commit -notmatch '^[a-f0-9]{40}$' -or $manifest.source.tree -notmatch '^[a-f0-9]{40}$') { Stop-InternalRelease 'release manifest identity is invalid.' }
    if (-not $manifest.files -or $manifest.fileCount -ne $manifest.files.Count) { Stop-InternalRelease 'release manifest file count is invalid.' }
    $expected = @{}
    foreach ($file in $manifest.files) {
      $relative = ConvertTo-SafeRelativePath ([string]$file.path)
      $key = $relative.ToLowerInvariant()
      if ($expected.ContainsKey($key) -or $relative -ieq 'release-manifest.json') { Stop-InternalRelease 'manifest contains duplicate or reserved file paths.' }
      if ($file.sha256 -notmatch '^[a-f0-9]{64}$' -or [long]$file.size -lt 0) { Stop-InternalRelease 'manifest has invalid file integrity metadata.' }
      $expected[$key] = $file
    }
    if ($files.Count -ne ($expected.Count + 1)) { Stop-InternalRelease 'ZIP file set differs from its manifest.' }
    foreach ($key in $expected.Keys) {
      if (-not $files.ContainsKey($key)) { Stop-InternalRelease 'ZIP is missing a manifest-listed file.' }
      $entry = $files[$key]
      $file = $expected[$key]
      if ([long]$entry.Length -ne [long]$file.size) { Stop-InternalRelease 'ZIP entry size differs from manifest.' }
      $stream = $entry.Open()
      $sha = [System.Security.Cryptography.SHA256]::Create()
      try { $digest = [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose(); $stream.Dispose() }
      if ($digest -ne [string]$file.sha256) { Stop-InternalRelease 'ZIP entry hash differs from manifest.' }
    }
    return [pscustomobject]@{ Manifest = $manifest; ZipSha256 = $zipHash }
  } finally { $archive.Dispose() }
}

function Assert-NoReparseAncestor([string]$Path) {
  $current = [System.IO.Path]::GetFullPath($Path)
  while ($true) {
    if (Test-Path -LiteralPath $current) {
      $item = Get-Item -LiteralPath $current -Force
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { Stop-InternalRelease 'path traverses a reparse point.' }
    }
    $parent = [System.IO.Path]::GetDirectoryName($current)
    if (-not $parent -or $parent -eq $current) { break }
    $current = $parent
  }
}

function Assert-UedPrivateAcl([string]$Path) {
  $acl = Get-Acl -LiteralPath $Path
  $broadSids = @('S-1-1-0', 'S-1-5-11', 'S-1-5-32-545')
  $writeMask = [int]([System.Security.AccessControl.FileSystemRights]::Write -bor [System.Security.AccessControl.FileSystemRights]::Modify -bor [System.Security.AccessControl.FileSystemRights]::FullControl)
  foreach ($rule in $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and $rule.IdentityReference.Value -in $broadSids -and ([int]$rule.FileSystemRights -band $writeMask) -ne 0) {
      Stop-InternalRelease 'install/config path grants broad principals write access.'
    }
  }
}

function Expand-UedInternalArchive([string]$ZipPath, [string]$Destination) {
  $root = [System.IO.Path]::GetFullPath($Destination)
  if (Test-Path -LiteralPath $root) { Stop-InternalRelease 'release destination already exists; refusing overwrite.' }
  $null = [System.IO.Directory]::CreateDirectory($root)
  Assert-NoReparseAncestor $root
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead([System.IO.Path]::GetFullPath($ZipPath))
  try {
    $rootPrefix = $root.TrimEnd('\') + '\'
    foreach ($entry in $archive.Entries) {
      $raw = $entry.FullName.Replace('\', '/')
      if ($raw.EndsWith('/')) { continue }
      $relative = ConvertTo-SafeRelativePath $raw
      $target = [System.IO.Path]::GetFullPath((Join-Path $root ($relative.Replace('/', '\'))))
      if (-not $target.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { Stop-InternalRelease 'archive path escapes release destination.' }
      $parent = Split-Path -Parent $target
      $null = [System.IO.Directory]::CreateDirectory($parent)
      Assert-NoReparseAncestor $parent
      $inputStream = $entry.Open()
      try {
        $outputStream = [System.IO.File]::Open($target, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        try { $inputStream.CopyTo($outputStream) } finally { $outputStream.Dispose() }
      } finally { $inputStream.Dispose() }
    }
  } finally { $archive.Dispose() }
  return $root
}

function Set-UedRuntimeEnvironment([string]$ConfigPath) {
  $config = Import-PowerShellDataFile -LiteralPath ([System.IO.Path]::GetFullPath($ConfigPath))
  $allowed = @('DATA_DIR', 'TRAINING_MEDIA_DIR', 'AGENT_RUNTIME_DIR', 'ASSET_HUB_RUNTIME_DIR', 'DSH_SOURCE_DIR', 'DSH_RUNTIME_SOURCE_DIR', 'HALDUR_DESIGN_SKILL_ROOT', 'HALDUR_DESIGN_SKILL_RUNTIME_ROOT', 'DSH_PORT', 'AGENT_PROXY_PORT', 'HOST_PORT', 'HOST_INTERNAL_PORT', 'KNOWLEDGE_GATEWAY_MCP_PORT')
  foreach ($name in $config.Keys) {
    if ($name -notin $allowed) { Stop-InternalRelease "unsupported runtime config key: $name" }
    [Environment]::SetEnvironmentVariable($name, [string]$config[$name], 'Process')
  }
  return $config
}

function Invoke-UedRuntimePreflight([string]$ReleaseRoot, [string]$ConfigPath) {
  $null = Set-UedRuntimeEnvironment $ConfigPath
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) { Stop-InternalRelease 'Node.js is not available on PATH.' }
  Push-Location $ReleaseRoot
  try {
    & $node.Source 'scripts/internal-release-preflight.mjs' $ReleaseRoot
    if ($LASTEXITCODE -ne 0) { Stop-InternalRelease 'runtime path preflight failed.' }
  } finally { Pop-Location }
}

function Assert-UedReleaseTree([string]$ReleaseRoot) {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) { Stop-InternalRelease 'Node.js is not available on PATH.' }
  Push-Location $ReleaseRoot
  try {
    & $node.Source 'scripts/internal-release-contract.mjs' verify --root $ReleaseRoot
    if ($LASTEXITCODE -ne 0) { Stop-InternalRelease 'release directory failed manifest verification.' }
  } finally { Pop-Location }
}

function Read-UedReleasePointer([string]$InstallRoot, [string]$PointerName) {
  $path = Join-Path ([System.IO.Path]::GetFullPath($InstallRoot)) $PointerName
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
  Assert-NoReparseAncestor $path
  $pointer = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
  if ($pointer.schemaVersion -ne 1 -or $pointer.directory -notmatch '^releases/internal-[a-z0-9.-]{1,80}-[a-f0-9]{12}$') { Stop-InternalRelease 'release pointer is invalid.' }
  $release = [System.IO.Path]::GetFullPath((Join-Path $InstallRoot ($pointer.directory.Replace('/', '\'))))
  $releasesRoot = [System.IO.Path]::GetFullPath((Join-Path $InstallRoot 'releases')).TrimEnd('\') + '\'
  if (-not $release.StartsWith($releasesRoot, [System.StringComparison]::OrdinalIgnoreCase)) { Stop-InternalRelease 'release pointer escapes the install root.' }
  if (-not (Test-Path -LiteralPath $release -PathType Container)) { Stop-InternalRelease 'release pointer target is missing.' }
  return [pscustomobject]@{ Path = $path; Value = $pointer; ReleaseRoot = $release }
}

function Write-UedReleasePointer([string]$InstallRoot, [string]$PointerName, $Pointer) {
  Assert-NoReparseAncestor $InstallRoot
  $path = Join-Path ([System.IO.Path]::GetFullPath($InstallRoot)) $PointerName
  $temp = "$path.tmp-$([Guid]::NewGuid().ToString('N'))"
  $json = ConvertTo-Json -InputObject $Pointer -Depth 5
  [System.IO.File]::WriteAllText($temp, "$json`n", [System.Text.UTF8Encoding]::new($false))
  if (Test-Path -LiteralPath $path -PathType Leaf) {
    $backup = "$path.bak-$([Guid]::NewGuid().ToString('N'))"
    try { [System.IO.File]::Replace($temp, $path, $backup) }
    finally {
      if (Test-Path -LiteralPath $backup -PathType Leaf) { Remove-Item -LiteralPath $backup -Force }
      if (Test-Path -LiteralPath $temp -PathType Leaf) { Remove-Item -LiteralPath $temp -Force }
    }
  }
  else { [System.IO.File]::Move($temp, $path) }
}

Export-ModuleMember -Function Get-UedArchiveManifest, Assert-NoReparseAncestor, Assert-UedPrivateAcl, Expand-UedInternalArchive, Set-UedRuntimeEnvironment, Invoke-UedRuntimePreflight, Assert-UedReleaseTree, Read-UedReleasePointer, Write-UedReleasePointer
