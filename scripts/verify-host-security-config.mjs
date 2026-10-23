import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, symlink, realpath, writeFile, chmod } from "node:fs/promises";
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
assertRejected({ ...valid, NODE_ENV: "production", ADMIN_SESSION_SECURE: "false", PUBLIC_ORIGIN: "https://asset-hub.test" }, "host_security_config_invalid", "ADMIN_SESSION_SECURE");
assertRejected({ ...valid, NODE_ENV: "production", ADMIN_SESSION_SECURE: "true", PUBLIC_ORIGIN: "http://asset-hub.test" }, "host_security_config_invalid", "PUBLIC_ORIGIN");
assert.deepEqual(resolveHostSecurityConfig({ ...valid, NODE_ENV: "production", ADMIN_SESSION_SECURE: "true", PUBLIC_ORIGIN: "https://asset-hub.test" }), { username: valid.ADMIN_USERNAME, password: valid.ADMIN_PASSWORD, sessionSecret: valid.ADMIN_SESSION_SECRET });

const localTestRoot = await mkdtemp(path.join(os.tmpdir(), "ued-local-test-security-"));
try {
  const localTestData = path.join(localTestRoot, "synthetic-data");
  await mkdir(localTestData);
  const localTestEnvironment = { ...valid, ADMIN_USERNAME: "admin", ADMIN_PASSWORD: "password123", NODE_ENV: "development", UED_LOCAL_TEST_MODE: "true", ADMIN_SESSION_SECURE: "false", PUBLIC_ORIGIN: "http://127.0.0.1:3027", HOST_BIND_HOST: "127.0.0.1", TMPDIR: localTestRoot, DATA_DIR: localTestData };
  assert.deepEqual(resolveHostSecurityConfig(localTestEnvironment), { username: "admin", password: "password123", sessionSecret: valid.ADMIN_SESSION_SECRET });
  assertRejected({ ...localTestEnvironment, PUBLIC_ORIGIN: "http://192.168.1.4:3027" }, "host_security_config_invalid", "ADMIN_PASSWORD");
  assertRejected({ ...localTestEnvironment, DATA_DIR: os.tmpdir() }, "host_security_config_invalid", "ADMIN_PASSWORD");
  assert.deepEqual(resolveHostSecurityConfig({ ...localTestEnvironment, NODE_ENV: "production" }), { username: "admin", password: "password123", sessionSecret: valid.ADMIN_SESSION_SECRET });
  assertRejected({ ...localTestEnvironment, DATA_DIR: "/var/lib/ued-formal-data", NODE_ENV: "production" }, "host_security_config_invalid", "ADMIN_SESSION_SECURE");
} finally {
  await rm(localTestRoot, { recursive: true, force: true });
}

const demoRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), "ued-persistent-demo-security-")));
try {
  await mkdir(path.join(demoRoot, "hub-data"));
  const demo = { ...valid, NODE_ENV: "production", ADMIN_SESSION_SECURE: "false", PUBLIC_ORIGIN: "http://127.0.0.1:5647", HOST_BIND_HOST: "127.0.0.1", HOST_PORT: "5647", UED_LOCAL_DEMO_MODE: "true", UED_LOCAL_DEMO_ROOT: demoRoot, DATA_DIR: path.join(demoRoot, "hub-data") };
  if (process.platform === "darwin") {
    assert.equal(resolveHostSecurityConfig(demo).username, valid.ADMIN_USERNAME);
    const loginPath = path.join(demoRoot, "login.json");
    const configPath = path.join(demoRoot, "host.json");
    const { ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_SESSION_SECRET, ADMIN_SESSION_SECURE, ...host } = demo;
    await writeFile(loginPath, JSON.stringify({ ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_SESSION_SECRET, ADMIN_SESSION_SECURE }), { mode: 0o600 });
    await writeFile(configPath, JSON.stringify(host));
    const checkLauncher = () => spawnSync("python3", [path.join(projectDir, "scripts/start-mac-demo.py"), "--config", configPath, "--login", loginPath, "--check"], { encoding: "utf8" });
    assert.equal(checkLauncher().status, 0, "protected config must validate without starting services");
    await chmod(loginPath, 0o644);
    const unsafeLogin = checkLauncher();
    assert.notEqual(unsafeLogin.status, 0, "world-readable credentials must reject startup");
    assert.equal(`${unsafeLogin.stdout}${unsafeLogin.stderr}`.includes(ADMIN_PASSWORD), false);

    for (const overrides of [
      { UED_LOCAL_DEMO_MODE: undefined }, { HOST_BIND_HOST: "0.0.0.0" },
      { PUBLIC_ORIGIN: "http://192.168.1.4:5647" }, { HOST_PORT: "3047" },
      { PUBLIC_ORIGIN: "http://127.0.0.1:5647/other" }, { DATA_DIR: demoRoot }
    ]) assertRejected({ ...demo, ...overrides }, "host_security_config_invalid", "ADMIN_SESSION_SECURE");
    assertRejected({ ...demo, ADMIN_PASSWORD: "password123" }, "host_security_config_invalid", "ADMIN_PASSWORD");
    await symlink(path.join(demoRoot, "hub-data"), path.join(demoRoot, "alias"));
    assertRejected({ ...demo, DATA_DIR: path.join(demoRoot, "alias") }, "host_security_config_invalid", "ADMIN_SESSION_SECURE");
  } else assertRejected(demo, "host_security_config_invalid", "ADMIN_SESSION_SECURE");
} finally { await rm(demoRoot, { recursive: true, force: true }); }

const marker = "host-security-redaction-marker";
const isolatedCwd = await mkdtemp(path.join(os.tmpdir(), "ued-host-security-"));
try {
  const { ADMIN_SESSION_SECURE: _inheritedSecure, PUBLIC_ORIGIN: _inheritedOrigin, NODE_ENV: _inheritedNodeEnv, ...platformEnvironment } = process.env;
  const inherited = { ...platformEnvironment, ...valid, NODE_ENV: "test", ADMIN_PASSWORD: `example-${marker}` };
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
assert.deepEqual(Object.keys(record).sort(), ["component", "dshCommit", "exitCode", "exitSignal", "generation", "health", "operation", "operationId", "ownership", "phase", "pid", "reasonCode", "recoveryCount", "restartCount", "status", "stderrRef", "timestamp"].sort());
assert.equal(JSON.stringify(record).includes(marker), false, "public lifecycle records must not include secrets");
console.log("[Host Security] Configuration validation and redaction verification passed.");
