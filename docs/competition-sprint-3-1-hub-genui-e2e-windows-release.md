# Competition Sprint 3.1 — Hub GenUI E2E and Windows Release Closeout

**Status: `PARTIAL` (2026-10-14).** The local isolated test Hub now uses the user-specified stable synthetic account from `/private/tmp/competition-sprint-3-live/credentials/admin-access.txt`; it is injected by the private runner and is not stored in source, Git, the release payload, or this report. The resolved root cause of the earlier login failure was configuration validation: HTTP loopback with `ADMIN_SESSION_SECURE=false` was rejected by the production-only HTTPS guard and surfaced as a generic credential error. A narrowly gated `UED_LOCAL_TEST_MODE` now permits this only when the origin and bind are loopback and `DATA_DIR` is under an OS temp root; formal production HTTPS/Secure-Cookie validation and the default-password deny list remain active elsewhere. A controlled stop/restart preserved the configured account; both the login API and browser login then passed. The isolated standalone build initially omitted client chunks from its standalone directory, which prevented form hydration; copying the generated local-test static assets into that ignored build output fixed the browser login. Hub MCP search/get works through the real Agent turn and GenUI artifact build passed, but the embedded preview remains blank/unavailable; its authenticated bridge behavior remains unresolved. Windows ZIP construction and Windows installation were not run because this host is macOS and the authorized release script requires Windows x64 PowerShell plus Visual Studio x64 MSVC.

## Source and pinned components

| Item | Evidence |
| --- | --- |
| Source branch / Sprint 3 baseline commit / tree | `codex/competition-sprint-3` / `bfcc59085c15d5bdc9b23fd36e6c9736327f0776` / `2c7efd5c2283c928c90240c0baadda64d6569242` |
| Sprint 2 baseline | `15d6d01ecb9413b87e0a6e32d7f2a49202f285c3` |
| DSH | `dsh-v0.1.1-rc.2` / `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` |
| GenUI | `dsh-plugin-genui@0.15.1`, MIT |
| Bundled npm package SHA-256 | `ac555017451724f6a4b990da8ac951603c8cfc8c61634b6015067f71c689689b` |
| Windows ZIP | `NOT_CREATED` |

The Sprint 3 tarball is committed at `agent-integration/dsh/packages/dsh-plugin-genui-0.15.1.tgz`; the GenUI boundary verifier checks its SHA-256 against `genui-plugin.json` and checks its release-payload/build-script inclusion. In the live isolated DSH profile, the package is installed as version `0.15.1` from the SHA-named local tarball, remains a profile dependency, and is absent from global bundles. Only the explicit `asset-hub-genui-restricted` preset mounts it. This proves the source/payload delivery contract, not inclusion in a built ZIP.

## Runtime and Hub probe

- Isolated loopback listeners observed: Hub public `3027` PID `32557`, Hub internal `3028` PID `32558`, Knowledge Gateway `3082` PID `32595`, Agent Proxy `3081` PID `32603`, DSH `3080` PID `35653`. The DSH process working directory is the dedicated `/private/tmp/competition-sprint-3-dsh-runtime`; other listeners use `/private/tmp/competition-sprint-3`.
- HTTP status probes: Hub `/` `200`; internal Hub `/` `200`; DSH `/` `200`; DSH `/.well-known/dsh-genui` `200`; Agent Proxy `/healthz` `200`. Gateway `/mcp` answered `405` to an ordinary `GET`, consistent with this being an MCP endpoint rather than a GET health route.
- The fixed test account is read from the owner-only (`0600`) private credential file and passed through the explicit local runner configuration. After process restart, a local login POST returned `200`, set the admin session cookie, and a replayed session probe returned `{"authenticated":true}`. A request with incorrect credentials returned `401`/`invalid_credentials`. Browser login after restart passed and opened the Hub admin dashboard.
- The restarted isolated stack is stable on loopback: Hub public `3027`, Hub internal `3028`, Knowledge Gateway `3082`, DSH `3080`, Agent Proxy `3081`. The private runner uses a production build plus `next start`/the isolated standalone output to avoid the observed Next dev Watchpack `EMFILE` restart loop. It supplies HTTP loopback, `ADMIN_SESSION_SECURE=false`, the local-test marker and temporary synthetic DATA paths. The marker is passed only to the Asset Hub child and is not passed to DSH or Agent Proxy.
- In the Hub Agent conversation, the configured DeepSeek model called Knowledge MCP search and get for the synthetic micro-spec. Both calls returned the expected synthetic asset and full content. The model created `s-987516b2319f-sprint31-token-settings`, version `v-0df321cc-9d8c-4415-a5d3-0ed33ef289a1`; GenUI inspection reported `ready`, build `passed`, diagnostics empty, capabilities empty. The embedded card itself fails to open and exposes only its retry control. An unauthenticated direct preview probe returned `401`. The official GenUI preview iframe has a restrictive `sandbox="allow-scripts allow-modals"` and `referrerPolicy="no-referrer"`; this report does not claim the sandbox-cookie interaction as a conclusively proven root cause. No iframe sandbox or Proxy-wide auth relaxation was made. Hub UI interaction/save, refresh recovery and follow-up state read are therefore `NOT_VERIFIED`.
- Existing standalone DSH evidence remains distinct: synthetic real-model Knowledge MCP search → get citation, React generation/build, browser rendering, three-control interaction/save (`18px`, `12px`, `32px`), same-session refresh recovery, and next-turn `genui_state_read` all passed. User-entered DeepSeek credentials were not read or included in evidence.
- The untracked root `server.js` is byte-identical to `.next/standalone/server.js` (SHA-256 `3c93d4de734e53b8135e79fcda5620a111102ede0a91b1ee87302aa456afe6f8`, 6,487 bytes). Host Supervisor launches `server.js`; this is the live isolated Hub's generated Next standalone runtime entry, not an independent helper to add to Git. The Windows release build runs `next build`, copies `.next/standalone` including its generated `server.js`, and verifies it. The local generated copy remains untracked and is excluded from the release source identity. For the local-only `.next-local-test` build, its generated `static` directory was copied into the matching standalone runtime directory; this ignored build output is not a source or release change.

## Windows package boundary

- `scripts/build-internal-windows-release.ps1` rejects non-Windows x64. It also requires Git, `npm.cmd`, pinned Node `22.23.2`, npm `10.9.8`, Visual Studio Build Tools x64 and `cl.exe` to compile the native Windows helpers. This host reports `Darwin`; `pwsh`, Windows PowerShell, and `cl.exe` are unavailable. No cross-platform/manual ZIP was substituted.
- Consequently no candidate ZIP, SHA-256 sidecar, release manifest, installer execution, isolated Windows runtime, or Windows program rollback evidence exists. Existing production/staging services and data were not touched.
- Minimal Windows handoff: export the exact committed source bundle and identity using the project's existing `scripts/export-internal-release-inputs.mjs`, transfer them and the existing `scripts/` to a new authorized Windows x64 build root, then run `build-internal-windows-release.ps1` with unique new build/output directories. Verify the ZIP sidecar and manifest before the separate CheckOnly/install/runtime/rollback steps in `INTERNAL-RELEASE-README.md`.

## Dependency audit (read-only)

On 2026-10-14, `npm audit --json` reported `26 high`, `3 moderate`, `5 low`, `0 critical` across the complete development/build dependency graph. `npm audit --omit=dev --json` reported `0 high`, `0 critical`, and `5 low` in production dependencies. High findings include build/lint/transitive pattern-matching packages such as `brace-expansion` / `minimatch`; their advisories describe denial of service when applications pass attacker-controlled patterns, including glob-like inputs ([brace-expansion GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp), [minimatch GHSA-7r86-cg39-jmmj](https://github.com/advisories/GHSA-7r86-cg39-jmmj)). These packages are omitted from the production install path in the release script (`npm prune --omit=dev`). No High/Critical runtime dependency was identified by the production-only audit; no `npm audit fix` or dependency upgrade was performed.

The five production Low findings are in the Markdown math stack (`@milkdown/crepe`, `@milkdown/react`, `remark-math`, `micromark-extension-math`, `katex`). The KaTeX advisory requires pre-existing prototype pollution or attacker-influenced options/prototypes, and warns of unsafe generated links/resources if rendered without sanitization ([KaTeX GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7)). This remains a follow-up review item for the Markdown render path; this audit alone did not demonstrate exploitability in Asset Hub.

## Verification and closeout

Reused Sprint 3 evidence: `node scripts/verify-agent-genui-boundary.mjs`, `node scripts/verify-agent-runtime-boundary.mjs`, `node scripts/verify-knowledge-gateway-mcp.mjs`, `npm run verify:knowledge-write`, `npm run verify:knowledge-gateway`, `node scripts/verify-windows-deployment-contract.mjs`, `node scripts/verify-dsh-provenance-contract.mjs`, and syntax checks passed on the committed source. Re-ran `node scripts/verify-host-security-config.mjs`, `node scripts/verify-agent-runtime-boundary.mjs`, `node scripts/verify-agent-genui-boundary.mjs`, `node scripts/verify-windows-deployment-contract.mjs`, and the local production build with `UED_LOCAL_TEST_MODE=true`; all passed. A separate `npm run typecheck` initially reported stale `.next/types/validator.ts` route types from the other build directory, while the clean isolated production build completed its own type check successfully. No PowerShell parser or Windows installer run was possible on this host. The isolated stack remains running on loopback. No production/staging services, real assets, API key, Git push, or deployment were touched.

```text
SPRINT_3_1_SOURCE_BASELINE=15d6d01ecb9413b87e0a6e32d7f2a49202f285c3
SPRINT_3_1_NEW_LOCAL_COMMIT=created locally; current Git HEAD is the closeout commit
DSH_PIN=dsh-v0.1.1-rc.2 / b150a551b8d465e31e418e1b2eaf5e79bbb7d28e
GENUI_PIN=dsh-plugin-genui@0.15.1
HUB_EMBEDDED_GENUI_SESSION=PASS (authenticated Hub Agent conversation; embedded preview rendering still blocked)
HUB_REACT_GENERATION=PASS (artifact build)
HUB_UI_INTERACTION_AND_SAVE=NOT_VERIFIED
HUB_REFRESH_STATE_RESTORE=NOT_VERIFIED
HUB_FOLLOWUP_AGENT_STATE_READ=NOT_VERIFIED
HUB_ADMIN_LOGIN_AFTER_RESTART_API=PASS
HUB_ADMIN_LOGIN_AFTER_RESTART_BROWSER=PASS
DESIGN_SKILL_MCP_APPLICATION=PASS (synthetic Knowledge search -> get in Hub Agent)
GENUI_PLUGIN_DELIVERY=PARTIAL
WINDOWS_ZIP_SHA256=NONE
WINDOWS_INSTALLER_EXECUTION=NOT_VERIFIED
WINDOWS_ISOLATED_RUNTIME=NOT_VERIFIED
WINDOWS_PROGRAM_ROLLBACK=NOT_VERIFIED
PROTECTED_SERVICES_TOUCHED=false
REAL_ASSET_SOURCE_MODIFIED=false
TEST_ADMIN_CREDENTIAL_USED=true (user-authorized synthetic local account; value is excluded from this report)
TEST_ADMIN_CREDENTIAL_EXPOSED_IN_CHAT_OR_GIT=false
MODEL_API_KEY_READ_OR_EXPOSED=false
GIT_PUSHED=false
PRODUCTION_DEPLOYED=false
FINAL_VERDICT=PARTIAL
NEXT_MINIMAL_ACTION=修复经确认的 Hub-to-GenUI sandbox preview authentication bridge，而不移除 iframe sandbox 或放宽 Proxy 全局认证；在浏览器中完成 artifact 控件交互、状态保存、刷新恢复与下一轮状态读取。随后需 Windows x64 + PowerShell + MSVC 环境生成候选 ZIP 并做实机隔离验收。
```
