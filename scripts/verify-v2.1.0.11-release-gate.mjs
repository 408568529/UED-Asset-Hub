import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { access, lstat, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const projectDir = process.cwd();
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

function safePlatformEnvironment() {
  const keys = ["PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "WINDIR", "ComSpec", "TMP", "TEMP", "TMPDIR", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "USER", "LOGNAME", "NODE_OPTIONS", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR"];
  return Object.fromEntries(keys.flatMap((key) => typeof process.env[key] === "string" && process.env[key].length > 0 ? [[key, process.env[key]]] : []));
}

function run(command, args, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectDir, env: environment, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("Release Gate command failed.")));
  });
}

async function text(command, args, directory = projectDir) {
  const chunks = [];
  const child = spawn(command, args, { cwd: directory, stdio: ["ignore", "pipe", "ignore"] });
  child.stdout.on("data", (chunk) => chunks.push(chunk));
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (code !== 0) throw new Error("Release Gate baseline check failed.");
  return Buffer.concat(chunks).toString("utf8");
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function metadataHash(root) {
  if (!root) return "not-configured";
  const entries = [];
  async function visit(directory) {
    const directoryEntries = await readdir(directory, { withFileTypes: true }).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
    if (directoryEntries === null) return;
    for (const entry of directoryEntries.sort((left, right) => left.name.localeCompare(right.name))) {
      const filePath = path.join(directory, entry.name);
      const stat = await lstat(filePath);
      const relative = path.relative(root, filePath);
      entries.push(`${createHash("sha256").update(relative).digest("hex")}:${stat.isDirectory() ? "d" : stat.isSymbolicLink() ? "l" : "f"}:${stat.size}:${stat.mtimeMs}`);
      if (stat.isDirectory() && !stat.isSymbolicLink()) await visit(filePath);
    }
  }
  await visit(root);
  return createHash("sha256").update(entries.join("\n")).digest("hex");
}

async function main() {
  loadEnvConfig(projectDir);
  const configuredDshSourceDir = process.env.DSH_SOURCE_DIR?.trim();
  if (!configuredDshSourceDir) throw new Error("Release Gate requires DSH_SOURCE_DIR.");
  const dshSourceDir = path.resolve(configuredDshSourceDir);
  const protectedRoots = [process.env.DATA_DIR, process.env.AGENT_RUNTIME_DIR, process.env.TRAINING_MEDIA_DIR].map((value) => value?.trim() ? path.resolve(value) : null);
  const envPath = path.join(projectDir, ".env.local");
  await Promise.all([access(envPath), access(dshSourceDir)]);
  const baseline = {
    assetHubStatus: await text("git", ["status", "--porcelain=v1"]),
    assetHubHead: await text("git", ["rev-parse", "HEAD"]),
    dshStatus: await text("git", ["status", "--porcelain=v1"], dshSourceDir),
    dshHead: await text("git", ["rev-parse", "HEAD"], dshSourceDir),
    envHash: await sha256(envPath),
    protectedRoots: await Promise.all(protectedRoots.map((root) => metadataHash(root)))
  };
  assert.equal((await text("git", ["diff", "--cached", "--quiet"]).catch(() => "dirty")), "", "staged changes are not allowed");
  assert.equal(baseline.dshStatus, "", "DSH Source must be clean before Release Gate");

  const testRoot = await mkdtemp(path.join(os.tmpdir(), "ued-v2.1.0.11-release-"));
  try {
    const dataDir = path.join(testRoot, "data");
    const agentRuntimeDir = path.join(testRoot, "agent-runtime");
    const trainingMediaDir = path.join(testRoot, "training-media");
    const fixtureDir = path.join(testRoot, "fixture-data");
    const fixtureBaseline = path.join(testRoot, "fixture-baseline.json");
    await Promise.all([mkdir(dataDir), mkdir(agentRuntimeDir), mkdir(trainingMediaDir), mkdir(fixtureDir)]);
    const environment = {
      ...safePlatformEnvironment(),
      NODE_ENV: "production",
      DATA_DIR: dataDir,
      AGENT_RUNTIME_DIR: agentRuntimeDir,
      TRAINING_MEDIA_DIR: trainingMediaDir,
      DSH_HOME: path.join(agentRuntimeDir, "dsh-home"),
      AGENT_WORKSPACE_ROOT: path.join(agentRuntimeDir, "workspaces"),
      DSH_SOURCE_DIR: dshSourceDir,
      ADMIN_PASSWORD: randomBytes(32).toString("base64url"),
      ADMIN_SESSION_SECRET: randomBytes(48).toString("base64url"),
      ADMIN_SESSION_SECURE: "false",
      AGENT_GATEWAY_TOKEN: randomBytes(32).toString("base64url"),
      DEEPSEEK_API_KEY: "",
      OPENAI_API_KEY: "",
      TEST_ENV_ENCRYPTION_KEY: ""
    };
    const commands = [
      ["npm", ["run", "typecheck"]],
      ["npm", ["run", "build"]],
      ["npm", ["run", "verify:host-security-config"]],
      ["npm", ["run", "verify:host-security-e2e"]],
      ["npm", ["run", "verify:runtime-data"]],
      ["npm", ["run", "verify:knowledge-readonly"]],
      ["npm", ["run", "verify:knowledge-write"]],
      ["npm", ["run", "verify:knowledge-gateway"]],
      [process.execPath, ["scripts/verify-knowledge-gateway-mcp.mjs"]],
      [process.execPath, ["scripts/verify-e2e-fixture.mjs", "snapshot", "--fixture", fixtureDir, "--output", fixtureBaseline]],
      [process.execPath, ["scripts/verify-e2e-fixture.mjs", "verify", "--fixture", fixtureDir, "--baseline", fixtureBaseline]],
      ["npm", ["run", "verify:agent-boundary"]],
      ["npm", ["run", "verify:dsh-source-policy"]],
      ["npm", ["run", "verify:runtime-supervisor"]],
      ["npm", ["run", "verify:runtime-control"]],
      ["git", ["diff", "--check"]]
    ];
    for (const [command, args] of commands) await run(command, args, environment);

    assert.equal(await sha256(envPath), baseline.envHash, ".env.local changed during Release Gate");
    assert.deepEqual(await Promise.all(protectedRoots.map((root) => metadataHash(root))), baseline.protectedRoots, "Formal DATA, Runtime, Credential, or Session metadata changed during Release Gate");
    assert.equal(await text("git", ["status", "--porcelain=v1"]), baseline.assetHubStatus, "Asset Hub working tree changed during Release Gate");
    assert.equal(await text("git", ["rev-parse", "HEAD"]), baseline.assetHubHead, "Asset Hub HEAD changed during Release Gate");
    assert.equal(await text("git", ["status", "--porcelain=v1"], dshSourceDir), baseline.dshStatus, "DSH Source changed during Release Gate");
    assert.equal(await text("git", ["rev-parse", "HEAD"], dshSourceDir), baseline.dshHead, "DSH Source HEAD changed during Release Gate");
    assert.equal((await text("git", ["diff", "--cached", "--quiet"]).catch(() => "dirty")), "", "staged changes are not allowed");
    console.log("[V2.1.0.11 Release Gate] isolated regression and Git boundary verification passed.");
  } finally {
    await rm(testRoot, { recursive: true, force: true });
  }
}

main().catch(() => {
  console.error("[V2.1.0.11 Release Gate] failed.");
  process.exitCode = 1;
});
