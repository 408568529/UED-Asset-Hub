# Youding Agent Integration

This directory owns the Asset Hub to DeepSeek Harness integration boundary. It does not vendor or modify the DSH source repository.

## Fixed Runtime

- Source: `https://github.com/deepseek-ai/deepseek-harness.git`
- Fixed version: `0.1.0-rc.5` at commit `47f943859bef60e4160492346772ded9b24f765a`
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

## Windows Setup And Start

The verified release is not available as the matching npm package version, so the official DSH source must be cloned separately from Asset Hub. The setup script never overwrites an existing DSH checkout with a different commit.

```powershell
.\agent-integration\scripts\setup-dsh.ps1 -DshSourceDir "D:\UED-Asset-Hub-DSH\deepseek-harness"
```

Start the checked-out source:

```powershell
.\agent-integration\scripts\start-dsh.ps1 -RuntimeDir "D:\UED-Asset-Hub\agent-data" -DshSourceDir "D:\UED-Asset-Hub-DSH\deepseek-harness"
```

For development diagnosis, verify the fixed DSH runtime:

```powershell
npm run verify:agent-runtime
```

For formal deployment, use `npm run start:host` from Asset Hub. Host Runner starts DSH, the loopback-only Agent Proxy and Asset Hub together. Browser clients access the official workbench through Asset Hub's same-origin `/agent-runtime/` path; they never connect to DSH or the Proxy directly.
