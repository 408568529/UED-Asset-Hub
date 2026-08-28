import fs from "node:fs";
import path from "node:path";

function readLocalEnvironment(name) {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return undefined;

  const entry = fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith(`${name}=`));

  if (!entry) return undefined;
  const value = entry.slice(entry.indexOf("=") + 1).trim();
  return value.replace(/^(["'])(.*)\1$/, "$2");
}

function isInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function fail(message) {
  console.error(`\n[UED Asset Hub] ${message}\n`);
  process.exit(1);
}

const projectDir = path.resolve(process.cwd());
const dataDir = process.env.DATA_DIR || readLocalEnvironment("DATA_DIR");
const trainingMediaDir = process.env.TRAINING_MEDIA_DIR || readLocalEnvironment("TRAINING_MEDIA_DIR");
const agentRuntimeDir = process.env.AGENT_RUNTIME_DIR || readLocalEnvironment("AGENT_RUNTIME_DIR");

if (!dataDir) {
  fail("缺少 DATA_DIR。生产主机必须在 .env.local 中配置仓库外的真实数据目录。");
}

if (isInside(projectDir, path.resolve(dataDir))) {
  fail("DATA_DIR 位于 Git 代码目录内。请改为仓库外路径，例如 D:/UED-Asset-Hub/runtime-data。");
}

if (trainingMediaDir && isInside(projectDir, path.resolve(trainingMediaDir))) {
  fail("TRAINING_MEDIA_DIR 位于 Git 代码目录内。请改为仓库外路径，例如 D:/UED-Asset-Hub/training-media。");
}

if (agentRuntimeDir && isInside(projectDir, path.resolve(agentRuntimeDir))) {
  fail("AGENT_RUNTIME_DIR 位于 Git 代码目录内。请改为仓库外路径，例如 D:/UED-Asset-Hub/agent-data。");
}

if (dataDir && agentRuntimeDir) {
  const dataRoot = path.resolve(dataDir);
  const agentRoot = path.resolve(agentRuntimeDir);
  if (dataRoot === agentRoot || isInside(dataRoot, agentRoot) || isInside(agentRoot, dataRoot)) {
    fail("DATA_DIR 与 AGENT_RUNTIME_DIR 必须彼此独立且互不包含。");
  }
}

console.log("[UED Asset Hub] Runtime data protection check passed.");
