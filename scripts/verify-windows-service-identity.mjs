import assert from "node:assert/strict";
import { b4bWindowsServiceName, isValidatedB4bServiceSidContext, productionWindowsServiceName, resolveInstalledB4bServiceSid, resolveWindowsServiceIdentity, validateWindowsServiceName } from "./windows-service-identity.mjs";
import { createB4bServiceLifecycle, transitionB4bServiceLifecycle } from "./b4b-service-identity-lifecycle.mjs";

assert.equal(resolveWindowsServiceIdentity({ environment: {} }).serviceName, productionWindowsServiceName);
assert.deepEqual(resolveWindowsServiceIdentity({ environment: { UED_WINDOWS_SERVICE_NAME: productionWindowsServiceName } }), { kind: "production", serviceName: productionWindowsServiceName, b4bRunId: null });
const runId = "g036b-20260922-a1b2c3d4";
const serviceName = b4bWindowsServiceName(runId);
assert.deepEqual(resolveWindowsServiceIdentity({ environment: { UED_WINDOWS_SERVICE_NAME: serviceName, UED_B4B_RUN_ID: runId } }), { kind: "b4b", serviceName, b4bRunId: runId });
for (const environment of [
  { UED_WINDOWS_SERVICE_NAME: "OtherService" },
  { UED_WINDOWS_SERVICE_NAME: productionWindowsServiceName, UED_B4B_RUN_ID: runId },
  { UED_WINDOWS_SERVICE_NAME: serviceName, UED_B4B_RUN_ID: "wrong-run" },
  { UED_WINDOWS_SERVICE_NAME: "UEDAssetHub-B4B-../../bad", UED_B4B_RUN_ID: runId },
  { UED_WINDOWS_SERVICE_NAME: "UEDAssetHub-B4B-", UED_B4B_RUN_ID: "" },
]) assert.throws(() => resolveWindowsServiceIdentity({ environment }));
assert.throws(() => validateWindowsServiceName("UED Asset Hub"));
assert.throws(() => b4bWindowsServiceName("bad/segment"));
assert.throws(() => b4bWindowsServiceName("x".repeat(49)));
let lifecycle = createB4bServiceLifecycle(runId);
lifecycle = transitionB4bServiceLifecycle(lifecycle, "MATERIALIZE");
lifecycle = transitionB4bServiceLifecycle(lifecycle, "INSTALL_IDENTITY", { serviceInstalled: true, serviceRunning: false, hostStarted: false });
await assert.rejects(() => resolveInstalledB4bServiceSid({ lifecycle, platform: "darwin" }));
await assert.rejects(() => resolveInstalledB4bServiceSid({ lifecycle: { ...lifecycle, serviceRunning: true }, platform: "win32" }));
assert.equal(isValidatedB4bServiceSidContext({ identity: lifecycle.identity, serviceSid: "S-1-5-80-1" }), false);
console.log("[UED Agent] Windows service identity contract passed.");
