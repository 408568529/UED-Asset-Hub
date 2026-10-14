# Competition Sprint 2 — DSH GenUI Integration

Date: 2026-10-14

Hub baseline: `5928316b49f4732cc6ae70bd18d538136d9212cf`

DSH: `dsh-v0.1.1-rc.2` (`b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`)

GenUI: `dsh-plugin-genui@0.15.1`

## Result

- The exact GenUI package was installed in the isolated DSH `web` profile through the official DSH Plugin Manager. Its profile manifest reports exact version `0.15.1`; no Windows/staging profile or model key was read.
- DSH loaded the Hub GenUI preset under the exact isolated web-profile overlay. `agentPreset.list` discovered `asset-hub-genui-restricted`; `session.create` returned that preset ID. `/.well-known/dsh-genui` returned HTTP 200 with route prefix `/genui`.
- GenUI client settings showed the plugin and its style control. Selecting `shadcn/ui`, saving, refreshing, and reopening retained the style preference.
- The Hub Proxy now defaults missing preset selection to `asset-hub-restricted`, accepts only that preset and the explicit `asset-hub-genui-restricted` choice, rejects arbitrary user preset IDs, and continues to require the Hub admin session. The Hub edge sends `/genui/*` and `/.well-known/dsh-genui` through the existing authenticated Agent Proxy. The default restricted prompt/tool composition is unchanged.
- The GenUI preset reuses the existing Knowledge MCP path. Prior isolated evidence contains two synthetic micro-spec `search → get` cycles; it is referenced by digest below and was not modified.
- GenUI files are included in the Windows private ZIP payload contract. The runtime installer uses the official DSH Plugin Manager to install the exact package into `AGENT_RUNTIME_DIR\\dsh-home\\profiles\\web`, then checks package name/version and npm integrity in the generated pnpm lockfile. The package itself is fetched from npm during provisioning; it is not currently vendored as an offline tarball inside the ZIP.

## Not verified

No model request was sent and no existing API key was inspected. Therefore real Agent generation of React source, generated-app interactions, app-state save/reload, and a later Agent turn reusing that state are `NOT_VERIFIED`. The UI style preference persistence above is a separate client-settings check and does not prove generated-app state persistence. Design Skill judgment and model-backed citation are also `NOT_VERIFIED`; only the Knowledge Gateway retrieval evidence is reusable.

No Windows build, ZIP construction, installation, deployment, or runtime validation was performed in this sprint. The modified PowerShell installer was not executable in this macOS environment. This is development integration work, not authorization to deploy or replace an existing Hub.

## Focused verification

- `verify-agent-genui-boundary.mjs`: PASS — authenticated GenUI opt-in, restricted default, and rejection of arbitrary preset IDs.
- `verify-agent-runtime-boundary.mjs`: PASS — DSH environment allowlist and isolated GenUI artifact root.
- `verify-g035-deployment-dsh-binding.mjs`: PASS — positive mapping and 10 fail-closed cases.
- `verify-windows-deployment-contract.mjs`: PASS — canonical artifact tree, manifest, transaction, and rollback contract.
- `verify-dsh-provenance-contract.mjs`: PASS — provenance positive and negative cases.
- Node syntax and JSON parse checks: PASS. `git diff --check`: PASS.
- Windows PowerShell parse/execution and ZIP build: `NOT_VERIFIED` on macOS.

## Reused Knowledge evidence

- `/private/tmp/competition-sprint-evidence/mcp-search-get-proof.json` SHA-256: `393f51d56f3e23000e8cce23cf2d887c0dc606c87e56786451c0ff3f3f0cf8cf`
- Synthetic `micro_sprint_validation/content.md` SHA-256: `497038ec5db10f367e2df93c825ec212433f7f15642b52b0d4706f7645777f00`
- Synthetic `micro_sprint_wording/content.md` SHA-256: `8219d8b6cb9d2496cdd77b2115875a07c3b7512560d263219f29eb5d318e1647`

## Windows private Release packaging

The ZIP will carry the GenUI identity/integrity manifest and the opt-in preset alongside the existing DSH, Gateway, Supervisor, Knowledge MCP, and rollback payload. During isolated DSH runtime provisioning, the installer invokes `dsh plugin --profile web add dsh-plugin-genui@0.15.1 --save-exact`; pnpm writes a profile-local lock containing the package integrity. The running Hub does not install packages or contact npm. For offline Windows installation, the remaining packaging task is to include the verified npm tarball in the ZIP and install it from that local artifact instead of the registry.

## Next steps

1. With an explicitly supplied test model credential available in the isolated DSH runtime, verify React generation, interaction, saved app state after reload, and a subsequent turn reading the saved state. Do not reuse an existing staging/production key.
2. On Windows, parse and execute the updated isolated-runtime installer; verify exact package identity/integrity, preset discovery, and the new authenticated routes without deploying.
3. If the Windows target has no npm access, package the verified `dsh-plugin-genui@0.15.1` tarball and verify its SHA-512 before installation.
4. Build and inspect the private Windows ZIP, then use its existing install/update/rollback workflow only under separate deployment authorization.
