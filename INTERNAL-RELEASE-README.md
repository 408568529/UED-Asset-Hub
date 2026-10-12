# UED Asset Hub Internal Windows Release

This is a private, non-production ZIP channel. It is separate from the Formal Frozen/Native Set gate and does not authorize a production deployment.

## Source baseline

- Starting commit: `e7944e8a6c8d241f8be3f1c31131e3e68a62afb2`
- Starting tree: `10ef814fa0c12fb1f08de9018026ce78feb48728`
- The release worktree is based on that commit. Every package records the final committed source SHA and tree SHA; never build from a dirty worktree.

## Build a Windows x64 package

From the clean release worktree, export one Git bundle and identity file to a new directory outside the repository:

```sh
node scripts/export-internal-release-inputs.mjs \
  --repo "/path/to/clean-release-worktree" \
  --commit "<full-commit-sha>" \
  --output-dir "/path/to/new-build-inputs"
```

Copy the bundle, `source-input.json`, and `scripts` folder to a Windows x64 build host with Git, Windows PowerShell, and Visual Studio Build Tools with x64 MSVC. The build script downloads and SHA-verifies portable Node.js `22.23.2`, prepares npm `10.9.8` under its unique build root, and loads the existing MSVC environment for native helper builds. It does not change system Node/npm. Run from new build and output directories:

```powershell
./scripts/build-internal-windows-release.ps1 `
  -SourceBundlePath 'C:\private-build\ued-asset-hub.bundle' `
  -SourceInputPath 'C:\private-build\source-input.json' `
  -SourceCommit '<full-commit-sha>' `
  -BuildRoot 'C:\private-build\build-<unique-id>' `
  -OutputDirectory 'C:\private-build\output-<unique-id>'
```

The output contains `UED-Asset-Hub-<internal-version>-win-x64.zip`, its `.sha256`, `tools\` installation scripts, and the README. Keep the ZIP, sidecar hash, manifest, and source identity together. The script builds from the verified bundle; it does not use an existing staging build.

## External runtime configuration

Copy `tools\internal-runtime-config.example.psd1` to a protected location outside both the install root and release directories. Fill it with existing absolute directories. Do not put passwords, API keys, cookies, certificates, or other secrets in this file.

Required, separate roots:

- `DATA_DIR`: Hub business data root itself. The Hub does not append another `data` directory.
- `TRAINING_MEDIA_DIR`: independent training-media root. No media migration or copy is performed.
- `AGENT_RUNTIME_DIR` and `ASSET_HUB_RUNTIME_DIR`: independent operational state roots.
- `DSH_SOURCE_DIR` and `DSH_RUNTIME_SOURCE_DIR`: new external DSH authority and runtime roots. These must not exist when the pinned DSH installer runs.
- `HALDUR_DESIGN_SKILL_ROOT` and `HALDUR_DESIGN_SKILL_RUNTIME_ROOT`: optional, but configure both together. These are distinct from `DATA_DIR\skill-center`.
- Runtime ports: `DSH_PORT`, `AGENT_PROXY_PORT`, `HOST_PORT`, `HOST_INTERNAL_PORT`, and `KNOWLEDGE_GATEWAY_MCP_PORT` must be distinct and unused.

Installation scripts validate that configured roots are absolute and separate from the install root and one another. The activation/start preflight then requires the directories to exist, be accessible, be separate from the release directory, and have the required access. It does not create, migrate, or initialize any data directory.

## First isolated install and start

Use a new, dedicated `InstallRoot`; do not use a Windows Service, scheduled task, existing staging install, or production service. Replace values below with paths specific to an isolated test root:

```powershell
$zip = 'C:\private-release\UED-Asset-Hub-internal-<version>-win-x64.zip'
$sha = (Get-Content "$zip.sha256").Split(' ')[0]
$install = 'D:\UED-Asset-Hub-Internal-Test\install'
$config = 'D:\UED-Asset-Hub-Internal-Test\config\internal-runtime-config.psd1'
./tools/install-internal-release.ps1 -ZipPath $zip -ExpectedSha256 $sha -InstallRoot $install -ConfigPath $config
$release = Join-Path $install 'releases\<internal-version>-<12-char-commit>'
& "$release\scripts\install-internal-dsh-runtime.ps1" -ReleaseRoot $release -ConfigPath $config
./tools/activate-internal-release.ps1 -InstallRoot $install -ReleaseVersion '<internal-version>' -ConfigPath $config
./tools/status-internal-release.ps1 -InstallRoot $install
./tools/start-current-internal-release.ps1 -InstallRoot $install -ConfigPath $config
```

The start command runs the packaged Host Supervisor in the current terminal. Use its supported graceful-stop command or Ctrl+C and verify the Supervisor result before starting it again. These scripts do not create or manage Windows services, scheduled tasks, or unrelated processes.

## Update and rollback

Build the next release from its own clean committed source and use a distinct package identity. Install it into the same `InstallRoot`; installation extracts to a new immutable version directory and never overwrites the active version. Then activate and start it:

```powershell
./tools/install-internal-release.ps1 -ZipPath $nextZip -ExpectedSha256 $nextSha -InstallRoot $install -ConfigPath $config
./tools/activate-internal-release.ps1 -InstallRoot $install -ReleaseVersion '<next-internal-version>' -ConfigPath $config
./tools/start-current-internal-release.ps1 -InstallRoot $install -ConfigPath $config
```

After stopping the isolated Supervisor, rollback validates and activates the recorded previous program release; it does not change DATA, media, Skill, or runtime state:

```powershell
./tools/rollback-internal-release.ps1 -InstallRoot $install -ConfigPath $config
./tools/status-internal-release.ps1 -InstallRoot $install
```

Test schema compatibility before any future deployment rollback. This channel does not provide a business-data backup or disaster-recovery guarantee.

## Data and security boundary

`DATA_DIR`, `TRAINING_MEDIA_DIR`, Hub Skill ZIP storage, Haldur Skill roots, Agent runtime, DSH workspace/log/artifact roots, and the release install root are external and distinct. The ZIP contains no Git metadata, real business data/media, customer Skill files, credentials, API keys, cookies, certificates, or generated evidence. The pinned DSH source/runtime is installed separately outside the ZIP and retains its upstream `LICENSE` and `THIRD_PARTY_NOTICES.md`.

The manifest records `INTERNAL_RELEASE`, source Commit/Tree, Windows build toolchain, pinned DSH identity, package file paths, sizes, and SHA-256 values. It is an integrity manifest, not a Formal Authority, signature, or anti-reverse-engineering mechanism.

No step in this workflow binds a package to existing business data, starts `UEDAssetHubR2C`, changes the current staging service, or deploys production. Those actions require separate authorization.
