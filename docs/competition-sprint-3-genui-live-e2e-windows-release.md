# UED Asset Hub Competition Sprint 3 — Live E2E and Windows Release

**Overall: `PARTIAL`**. The pinned plugin installs and mounts only through the explicit restricted GenUI preset after a minimal profile correction. A real DeepSeek call completed a Knowledge MCP search/get answer; `genui_create` built a synthetic React app which rendered in standalone DSH after refresh. Slider changes, save, same-session refresh recovery, and next-turn state reading all passed. Hub-embedded rendering and the Windows artifact/runtime remain unverified.

## Baseline and versions

| Item | Observed value |
| --- | --- |
| Sprint 3 source branch | `codex/competition-sprint-3` |
| Source base commit / tree | `15d6d01ecb9413b87e0a6e32d7f2a49202f285c3` / `2e2ed2d7644a16decb5f812d4487c8fd97b19d17` |
| DSH | `dsh-v0.1.1-rc.2`, `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` |
| GenUI | `dsh-plugin-genui@0.15.1`, MIT |
| npm integrity | `sha512-QrWQI039vtQCrjspa+bjhX1snNsFTELlMG5nrY2MsvA0T8D9iVF3blqe4sq1+LPaOrJ5A8RV0iA+xH0JtXeSvA==` |
| Bundled tarball SHA-256 | `ac555017451724f6a4b990da8ac951603c8cfc8c61634b6015067f71c689689b` |
| Node on the macOS validation host | `v24.15.0` |
| Windows ZIP | `NOT_CREATED`; no ZIP hash |

## GenUI and model evidence

- The user entered the DeepSeek key into the isolated DSH page. DSH `credentials.describe` returned `configured=true`, `writable=true`, `source=file`; the key value was never read or emitted. The Hub model-settings page was reported by the user as saved but not tested.
- The official Plugin Manager installed the verified local tarball. It originally added `dsh-plugin-genui` both as a dependency and as a global profile bundle. The explicit `asset-hub-genui-restricted` preset then attempted to mount the same plugin and DSH reported `duplicate prefix route "/genui"`. The installer now retains the verified dependency but removes only that plugin from global `dsh.profile.bundles`, preserving per-preset opt-in. The default `asset-hub-restricted` preset does not mount GenUI.
- The isolated DSH child was recovered by Host Supervisor after the profile correction. Lifecycle records show DSH exit code `0` followed by a `runtime_recovery` start. The explicit GenUI preset then selected without the duplicate-route error.
- A real model answer invoked `search_micro_specs`, `search_knowledge`, and `get_knowledge_asset` against synthetic content. It correctly reported blur/submit validation timing and immediate revalidation after an error, with a complete-content citation to `asset-hub://knowledge/micro-spec/micro-spec_c67c4d69a36f48a48c8fc3ee06dc2f59`.
- A real model call invoked `genui_design_export` and `genui_create` for `sprint3-form-preview`. The returned artifact is `s-eccd856e5944-sprint3-form-preview`, version `v-28cf9783-b77d-4ab9-b0f7-3b7fbd29362a`, titled “Sprint 3 表单预览工具”. Its evidence reports `status=ready`, `build=passed`, `diagnostics=[]`, `capabilities=[]`, and six generated files. This establishes model-driven artifact generation and compile acceptance, not browser rendering.
- A subsequent `genui_inspect` initially returned `browser=not-run`, empty `states`, and empty `grants`. Refreshing the standalone DSH chat then visibly rendered the embedded app. I changed the sliders to synthetic values 18px / 12px / 32px, clicked “保存选择”, and the page confirmed success. Reloading the same session restored all three values. In the next Agent turn, `genui_state_read` returned the exact same values without being told them. Hub-embedded rendering was not verified; the in-app browser blocked a one-time local login relay before it reached the Hub login route, so no authentication or cookie workaround was applied.

## Knowledge MCP

- Two synthetic micro-specs were created only in isolated DATA using the existing Markdown Knowledge write service.
- The live DSH Agent performed search → full get for the validation-timing spec. `get_knowledge_asset` returned `contentStatus=full`, `hasContent=true`, `truncated=false`; the model answer cited the returned asset key.
- Prior direct bridge/service search → get verification and the contract verifier remain valid. No embedding, FAISS, or additional store was introduced.

## Windows release

- No Windows ZIP was produced, no Windows installer was executed, and no Windows isolated runtime was launched in this turn. The host is macOS; `pwsh` is unavailable. Report these as `NOT_EXECUTED`, not PASS.
- The ZIP payload includes the pinned local tarball and its integrity manifest. The installer uses the official Plugin Manager and now preserves the restricted-preset opt-in boundary after installation.

## Safety and live services

- Model prompts and Knowledge documents contained synthetic design/validation data only. The DSH key remained in isolated DSH credential storage; no key value was read, logged, committed, or sent to chat.
- The test stack is bound to loopback on Hub `3027`, internal Hub `3028`, DSH `3080`, Agent Proxy `3081`, and Knowledge Gateway `3082`. The synthetic workspace and DATA live under `/private/tmp/competition-sprint-3-live/`.
- No production service, staging service, production DATA, real asset, HTTPS certificate, administrator password, or Windows host was modified. No Git push or deployment occurred.
- Runtime lifecycle evidence: `/private/tmp/competition-sprint-3-live/agent-runtime/logs/runtime-supervisor.ndjson`. No screenshot or recording file was captured. The local isolated stack remains running.

## Verification

Passed on the current source changes:

- `node scripts/verify-agent-genui-boundary.mjs`
- `node scripts/verify-agent-runtime-boundary.mjs`
- `node scripts/verify-knowledge-gateway-mcp.mjs`
- `npm run verify:knowledge-write`
- `npm run verify:knowledge-gateway`
- `node scripts/verify-windows-deployment-contract.mjs`
- `node scripts/verify-dsh-provenance-contract.mjs`
- `node --check scripts/host-supervisor.mjs`
- `node --check scripts/windows-release-payload.mjs`
- `node --check scripts/verify-agent-genui-boundary.mjs`

The Hub production build and earlier Sprint 2 checks were reused because their inputs did not change. Windows PowerShell parsing and ZIP construction were not run.

## Closeout fields

```text
SPRINT3_BASELINE_COMMIT=15d6d01ecb9413b87e0a6e32d7f2a49202f285c3
SPRINT3_LOCAL_COMMIT=SEE_GIT_HEAD
SPRINT3_SOURCE_TREE=SEE_GIT_HEAD_TREE
SPRINT3_DSH_TAG=dsh-v0.1.1-rc.2
SPRINT3_DSH_COMMIT=b150a551b8d465e31e418e1b2eaf5e79bbb7d28e
SPRINT3_GENUI_VERSION=0.15.1
SPRINT3_GENUI_PLUGIN_INSTALL=PASS
SPRINT3_GENUI_LIVE_MODEL=PASS_CREATE_BUILD_AND_STANDALONE_BROWSER
SPRINT3_GENUI_HUB_INLINE_RENDER=NOT_VERIFIED
SPRINT3_GENUI_INTERACTION_SAVE=PASS_18PX_12PX_32PX
SPRINT3_GENUI_REFRESH_RECOVERY=PASS_SAME_SESSION
SPRINT3_GENUI_NEXT_TURN_STATE=PASS_GENUI_STATE_READ
SPRINT3_SKILL_AGENT_LIVE_QA=PASS_SYNTHETIC_SEARCH_GET_CITED
SPRINT3_WINDOWS_ZIP_CREATED=false
SPRINT3_WINDOWS_ZIP_SHA256=NOT_CREATED
SPRINT3_WINDOWS_INSTALLER_EXECUTED=NOT_EXECUTED
SPRINT3_WINDOWS_ISOLATED_RUNTIME=NOT_EXECUTED
SPRINT3_ASSET_AND_SERVICE_SAFETY=PASS_SYNTHETIC_LOOPBACK_ONLY
GIT_PUSHED=false
PRODUCTION_DEPLOYED=false
```

## Smallest remaining work

1. Expose or restore the GenUI embedded client renderer in the DSH Web Client, then use the existing artifact to verify controls, saved state, refresh, and a later Agent turn.
2. Verify Hub-embedded rendering through a normal authenticated browser session; no login bypass or key transfer is authorized.
3. Run the pinned Windows ZIP build and installer on an authorized Windows host, then test the same restricted-preset and lifecycle path in isolated runtime.
4. Keep internal technical readiness separate from any formal deployment approval; complete the Windows/intranet freeze checklist before deployment decisions.
