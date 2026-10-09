import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const consumers = ["windows-release-constructor.mjs", "release-approval-store.mjs", "release-serial-runner.mjs", "run-release-serial.mjs", "windows-deployment-contract.mjs"];
let checks = 0;
for (const file of consumers) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  assert.doesNotMatch(source, /(?:import|export)\s.*(?:create-release-authority-approval|prepare-release-input-receipts)|(?:createReleaseAuthorityApproval|publishReleaseExecutionPermission|publishHistoricalRootSelection)\s*\(/u); checks++;
  assert.doesNotMatch(source, /create[-_ ]?if[-_ ]?missing|auto[-_ ]?approve/iu); checks++;
}
for (const file of ["build-windows-job-helper.mjs", "build-windows-pipe-security-adapter.mjs", "build-windows-dpapi-credential-helper.mjs"]) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  assert.match(source, /plan.mode === "release-native"\) throw new Error\("Release-native capture requires Windows x64 MSVC"\)/u); checks++;
  assert.match(source, /capture = await captureNativeBuild/u); checks++;
}
const store = await readFile(new URL("release-approval-store.mjs", import.meta.url), "utf8");
assert.match(store, /new WeakSet\(\)/u); checks++;
assert.match(store, /Trusted operator SID\/high-integrity administrator token required/u); checks++;
assert.doesNotMatch(store, /process\.env\.(?:APPROVAL|TRUST|AUTHORITY).*ROOT/u); checks++;
const constructor = await readFile(new URL("windows-release-constructor.mjs", import.meta.url), "utf8");
assert.match(constructor, /Legacy caller authority\/creation inputs cannot enter live admission/u); checks++;
assert.ok(constructor.indexOf("await validateAuthorityAdmission(values, paths)") < constructor.indexOf('await appendPhaseJournal(admission, { event: "started"')); checks++;
const lock = await readFile(new URL("release-journal-lock.mjs", import.meta.url), "utf8");
assert.match(lock, /Global\\\\UED-Release-Journal/u); checks++;
assert.match(lock, /CreateFile\(\$p,0x100004,3,\[IntPtr\]::Zero,3,\[uint32\]2147483648/u); checks++;
assert.doesNotMatch(lock, /FlushFileBuffers\(\$h\)/u); checks++;
process.stdout.write(JSON.stringify({ result: "PASS", checks, scope: "static explicit-review/consumer separation and append provider contract; no OS permission integration or live approval" }) + "\n");
