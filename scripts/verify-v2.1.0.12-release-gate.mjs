import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const projectDir = process.cwd();
const dshSourceDir = process.env.DSH_SOURCE_DIR?.trim();
if (!dshSourceDir) throw new Error("V2.1.0.12 Release Gate requires explicit DSH_SOURCE_DIR.");
function run(command, args, env) { return new Promise((resolve, reject) => { const child = spawn(command, args, { cwd: projectDir, env, stdio: "inherit" }); child.once("error", reject); child.once("exit", (code, signal) => code === 0 && !signal ? resolve() : reject(new Error(`subgate_nonzero:${command}:${args.join(" ")}`))); }); }
function git(args, cwd = projectDir) { return new Promise((resolve, reject) => { let output = ""; const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "inherit"] }); child.stdout.on("data", (chunk) => { output += chunk; }); child.once("error", reject); child.once("exit", (code) => code === 0 ? resolve(output) : reject(new Error(`git_failed:${args.join(" ")}`))); }); }
async function fileHash(filePath) { try { return createHash("sha256").update(await readFile(filePath)).digest("hex"); } catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return "absent"; throw error; } }
async function treeDigest(root) { const hash = createHash("sha256"); async function visit(relative = "") { for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) { const next = path.join(relative, entry.name); if (entry.isDirectory()) await visit(next); else { const detail = await stat(path.join(root, next)); hash.update(`${next}:${detail.size}:${detail.mtimeMs}\n`); } } } await visit(); return hash.digest("hex"); }
async function baseline() { return { assetHubStatus: await git(["status", "--porcelain=v1"]), envLocalHash: await fileHash(path.join(projectDir, ".env.local")), dshHead: (await git(["rev-parse", "HEAD"], dshSourceDir)).trim(), dshStatus: await git(["status", "--porcelain=v1"], dshSourceDir) }; }

const checks = [
  ["Static / Contract", process.execPath, ["--check", "scripts/runtime-diagnostics-contract.mjs"]], ["Typecheck", "npm", ["run", "typecheck"]], ["Build", "npm", ["run", "build"]],
  ["Runtime Diagnostics Contract", "npm", ["run", "verify:runtime-diagnostics-contract"]], ["Runtime Diagnostics Instrumentation", "npm", ["run", "verify:runtime-diagnostics-instrumentation"]], ["Runtime Supervisor", "npm", ["run", "verify:runtime-supervisor"]], ["Runtime Control", "npm", ["run", "verify:runtime-control"]], ["Host Security", "npm", ["run", "verify:host-security-config"]],
  ["Admin Diagnostics / API / UI", "npm", ["run", "verify:readonly-admin-diagnostics"]], ["Agent Boundary", "npm", ["run", "verify:agent-boundary"]], ["DSH Source Policy", "npm", ["run", "verify:dsh-source-policy"]], ["Integrated Host E2E / Read-only Side Effects", "npm", ["run", "verify:host-security-e2e"]], ["Git Diff", "git", ["diff", "--check"]]
];

const root = await mkdtemp(path.join(os.tmpdir(), "ued-v2.1.0.12-release-"));
const results = []; let exitCode = 1;
try {
  const before = await baseline();
  const dataDir = path.join(root, "data"); const agentRuntimeDir = path.join(root, "agent-runtime"); const trainingMediaDir = path.join(root, "training-media");
  await Promise.all([mkdir(dataDir), mkdir(agentRuntimeDir), mkdir(trainingMediaDir)]);
  const beforeIsolated = await treeDigest(root);
  const env = { ...process.env, NODE_ENV: "production", DATA_DIR: dataDir, AGENT_RUNTIME_DIR: agentRuntimeDir, DSH_HOME: path.join(agentRuntimeDir, "dsh-home"), AGENT_WORKSPACE_ROOT: path.join(agentRuntimeDir, "workspaces"), TRAINING_MEDIA_DIR: trainingMediaDir, DSH_SOURCE_DIR: dshSourceDir, ADMIN_USERNAME: "admin", ADMIN_PASSWORD: "v2.1.0.12-isolated-password", ADMIN_SESSION_SECRET: "x".repeat(48), AGENT_GATEWAY_TOKEN: "gate-token-".padEnd(48, "x"), DEEPSEEK_API_KEY: "", OPENAI_API_KEY: "", TEST_ENV_ENCRYPTION_KEY: "", ADMIN_SESSION_SECURE: "false" };
  for (const [name, command, args] of checks) { await run(command, args, env); results.push([name, "PASS"]); }
  const after = await baseline();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("boundary_audit_failed");
  const afterIsolated = await treeDigest(root);
  if (beforeIsolated !== afterIsolated) throw new Error("isolated_boundary_audit_failed");
  results.push(["DATA / Credential / Session Boundary", "PASS"], ["Git / Source Boundary", "PASS"]); exitCode = 0;
} catch (error) { results.push(["Blocking failure", error instanceof Error ? error.message : "verification_defect"]); }
finally { console.log("\nV2.1.0.12 Release Gate Summary\n"); for (const [name, result] of results) console.log(`${name}: ${result}`); console.log(`\nFINAL EXIT:\n${exitCode}`); await rm(root, { recursive: true, force: true }); process.exitCode = exitCode; }
