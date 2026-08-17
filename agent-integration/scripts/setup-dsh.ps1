param(
  [Parameter(Mandatory = $true)]
  [string]$DshSourceDir
)

$ErrorActionPreference = "Stop"
$expectedCommit = "47f943859bef60e4160492346772ded9b24f765a"
$repository = "https://github.com/deepseek-ai/deepseek-harness.git"
$sourcePath = [IO.Path]::GetFullPath($DshSourceDir)

if (Test-Path $sourcePath) {
  if (-not (Test-Path (Join-Path $sourcePath ".git"))) {
    throw "目标目录已存在且不是 DSH Git 仓库：$sourcePath"
  }

  $actualCommit = (git -C $sourcePath rev-parse HEAD).Trim()
  if ($actualCommit -ne $expectedCommit) {
    throw "目标 DSH 仓库版本不符合要求。为避免覆盖现有内容，脚本不会自动切换。期望 $expectedCommit，实际 $actualCommit。"
  }
} else {
  git clone $repository $sourcePath
  git -C $sourcePath checkout $expectedCommit
}

Push-Location $sourcePath
try {
  pnpm install --frozen-lockfile
  pnpm build
} finally {
  Pop-Location
}

Write-Host "DSH source is ready at $sourcePath"
