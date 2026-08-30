import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publicLifecycleRecord } from "./host-supervisor.mjs";
import { HostSecurityConfigError, resolveHostSecurityConfig, resolveProxySessionConfig } from "./host-security-config.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const valid = { ADMIN_USERNAME: "asset-hub-admin", ADMIN_PASSWORD: "v2-host-password!", ADMIN_SESSION_SECRET: "a".repeat(32) };

function assertRejected(environment, reasonCode, field) {
  assert.throws(() => resolveHostSecurityConfig(environment), (error) => error instanceof HostSecurityConfigError && error.reasonCode === reasonCode && error.field === field);
}

assert.deepEqual(resolveHostSecurityConfig(valid), { username: valid.ADMIN_USERNAME, password: valid.ADMIN_PASSWORD, sessionSecret: valid.ADMIN_SESSION_SECRET });
assert.deepEqual(resolveProxySessionConfig({ ADMIN_USERNAME: valid.ADMIN_USERNAME, ADMIN_SESSION_SECRET: valid.ADMIN_SESSION_SECRET }), { username: valid.ADMIN_USERNAME, sessionSecret: valid.ADMIN_SESSION_SECRET });
assert.equal(resolveHostSecurityConfig({ ...valid, ADMIN_USERNAME: undefined }).username, "admin");
assert.equal(resolveHostSecurityConfig({ ...valid, ADMIN_USERNAME: " " }).username, "admin");
for (const field of ["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET"]) {
  assertRejected({ ...valid, [field]: undefined }, "host_security_config_missing", field);
  assertRejected({ ...valid, [field]: "" }, "host_security_config_missing", field);
  assertRejected({ ...valid, [field]: " " }, "host_security_config_missing", field);
}
for (const password of ["admin123", "example-password", "<password>", "请设置密码"]) assertRejected({ ...valid, ADMIN_PASSWORD: password }, "host_security_config_invalid", "ADMIN_PASSWORD");
for (const sessionSecret of ["short", valid.ADMIN_USERNAME, valid.ADMIN_PASSWORD, `${valid.ADMIN_USERNAME}:${valid.ADMIN_PASSWORD}:ued-asset-hub`]) assertRejected({ ...valid, ADMIN_SESSION_SECRET: sessionSecret }, "host_security_config_invalid", "ADMIN_SESSION_SECRET");

const marker = "host-security-redaction-marker";
const isolatedCwd = await mkdtemp(path.join(os.tmpdir(), "ued-host-security-"));
try {
  const inherited = { ...process.env, ...valid, ADMIN_PASSWORD: `example-${marker}` };
  const started = spawnSync(process.execPath, [path.join(projectDir, "scripts/start-host.mjs")], { cwd: isolatedCwd, env: inherited, encoding: "utf8" });
  const output = `${started.stdout}${started.stderr}`;
  assert.notEqual(started.status, 0, "invalid Host security config must reject Host startup before side effects");
  assert.match(output, /host_security_config_invalid: ADMIN_PASSWORD/);
  assert.equal(output.includes(marker), false, "fatal Host Security output must redact values");
  assert.deepEqual(await readdir(isolatedCwd), [], "fatal Host Security configuration must not create runtime files");
} finally {
  await rm(isolatedCwd, { recursive: true, force: true });
}

const record = publicLifecycleRecord({ operationId: "operation", phase: "phase", component: "component", token: marker, password: marker, status: "configuration_required", reasonCode: "runtime_configuration_invalid" });
assert.deepEqual(Object.keys(record).sort(), ["component", "dshCommit", "exitCode", "exitSignal", "generation", "health", "operation", "operationId", "ownership", "phase", "pid", "reasonCode", "recoveryCount", "restartCount", "status", "timestamp"].sort());
assert.equal(JSON.stringify(record).includes(marker), false, "public lifecycle records must not include secrets");
console.log("[Host Security] Configuration validation and redaction verification passed.");
