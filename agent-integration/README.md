# Youding Agent Integration

This directory owns the Asset Hub to DeepSeek Harness integration boundary. The DSH source may live at `vendor/deepseek-harness` as an ignored, independent Git repository; Asset Hub never vendors it into its own Git history or modifies its source.

## Fixed Runtime

- Source: `https://github.com/deepseek-ai/deepseek-harness.git`
- Fixed version: `0.1.1-rc.2` at commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`
- Bind address: `127.0.0.1:3080` only

## Runtime Data

Set `AGENT_RUNTIME_DIR` outside this Git checkout. The start script creates these runtime-only paths:

```txt
agent-data/
├─ dsh-home/     # DSH profiles, sessions, settings and attachments
├─ workspaces/   # future AI workspaces
├─ artifacts/    # future confirmed AI artifacts
└─ logs/
```

These files are never part of Asset Hub `DATA_DIR` and must not be committed.

`DATA_DIR` and `AGENT_RUNTIME_DIR` must resolve to independent directories; neither may contain the other. The V2.1.0.1 Host Runner checks this with `realpath`, and DSH receives neither `DATA_DIR` nor its formal-data credentials. The Asset Hub profile disables generic shell, filesystem, filesystem-search and editor plugins. It retains the constrained browser workspace picker and the read-only Asset Hub Knowledge Gateway MCP tools.

## Windows Setup And Start

The verified release is not available as the matching npm package version. Keep the official DSH source as an independent Git repository, preferably at `vendor/deepseek-harness`; the setup script is for a new host only and must not be used for Source Relocation.

```powershell
.\agent-integration\scripts\setup-dsh.ps1 -DshSourceDir "D:\UED-Asset-Hub-Host\UED-Asset-Hub\vendor\deepseek-harness"
```

Use the checked-out source only as identity authority. Start a separate runtime materialization that has been derived from it and has no `.git` directory:

```powershell
.\agent-integration\scripts\start-dsh.ps1 -RuntimeDir "D:\UED-Asset-Hub\agent-data" -DshSourceDir "D:\UED-Asset-Hub-Host\UED-Asset-Hub\vendor\deepseek-harness" -DshRuntimeSourceDir "D:\UED-Asset-Hub-Staging\runtime\dsh"
```

For development diagnosis, verify the fixed DSH runtime:

```powershell
npm run verify:agent-runtime
```

For formal deployment, use `npm run start:host` from Asset Hub. Host Runner starts DSH, the loopback-only Agent Proxy and Asset Hub together. Browser clients access the official workbench through Asset Hub's same-origin `/agent-runtime/` path; they never connect to DSH or the Proxy directly.

Use a separate non-administrator Windows service account for Host Runner. Grant it Modify only on `AGENT_RUNTIME_DIR`; deny it access to `DATA_DIR`, the Asset Hub `.env.local`, DSH source, and unrelated host directories. This ACL boundary is required production defense in depth and does not require any DSH source modification.
