import { open, readFile, unlink } from "node:fs/promises";
import path from "node:path";

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && typeof error === "object" && error.code === "EPERM";
  }
}

export function supervisorLockPath(runtimeDirectories) {
  return path.join(runtimeDirectories.supervisor, "supervisor-lock.json");
}

export async function acquireSupervisorLock({ lockPath, instanceId, probeExistingSupervisor = async () => false }) {
  const payload = JSON.stringify({ version: 1, instanceId, pid: process.pid, startedAt: new Date().toISOString() });
  try {
    const handle = await open(lockPath, "wx", 0o600);
    await handle.writeFile(payload);
    await handle.close();
  } catch (error) {
    if (!error || typeof error !== "object" || error.code !== "EEXIST") throw error;
    const existing = await readFile(lockPath, "utf8").then(JSON.parse).catch(() => null);
    if (await probeExistingSupervisor(existing)) throw new Error("Host Supervisor 已在运行。");
    if (processIsAlive(existing?.pid)) throw new Error("Host Supervisor ownership 无法确认；拒绝清理仍存活的 lock。 ");
    await unlink(lockPath);
    const handle = await open(lockPath, "wx", 0o600);
    await handle.writeFile(payload);
    await handle.close();
  }
  return async () => { await unlink(lockPath).catch(() => {}); };
}
