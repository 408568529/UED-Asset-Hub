import { promises as fs } from "node:fs";
import path from "node:path";
import { getHaldurWritableRoots } from "@/services/haldurDesignSkillDirectoryService";

type RuntimeItem = { name: string; size: number };
async function inventory(directory: string): Promise<RuntimeItem[]> {
  try { return await Promise.all((await fs.readdir(directory, { withFileTypes: true })).map(async (entry) => { const target = path.join(directory, entry.name); const stat = await fs.stat(target); return { name: entry.name, size: stat.isDirectory() ? 0 : stat.size }; })); } catch { return []; }
}
export const haldurDesignSkillGovernanceService = {
  async recovery() {
    const { runtimeRoot } = await getHaldurWritableRoots();
    const journals = await inventory(path.join(runtimeRoot, "journal"));
    const incomplete = [] as Array<Record<string, unknown>>;
    for (const item of journals.filter((item) => item.name.endsWith(".json"))) {
      try { const value = JSON.parse(await fs.readFile(path.join(runtimeRoot, "journal", item.name), "utf8")) as Record<string, unknown>; if (value.status !== "committed" && value.status !== "rolled-back") incomplete.push({ operationId: value.operationId, operationType: value.operationType, sourceRelativePath: value.sourceRelativePath, targetRelativePath: value.targetRelativePath, journalState: value.status, rollbackResult: value.rollbackResult, errorCode: value.errorCode, recommendedAction: "Manual Intervention Required" }); } catch { incomplete.push({ journalState: "unreadable", recommendedAction: "Manual Intervention Required" }); }
    }
    return { status: incomplete.length ? "recovery-required" : "healthy", transactions: incomplete };
  },
  async runtime() {
    const { runtimeRoot } = await getHaldurWritableRoots();
    const [staging, journal, trash, audit] = await Promise.all([inventory(path.join(runtimeRoot, "staging")), inventory(path.join(runtimeRoot, "journal")), inventory(path.join(runtimeRoot, "trash")), inventory(path.join(runtimeRoot, "audit"))]);
    const disk = await fs.statfs(runtimeRoot); const freeBytes = Number(disk.bavail) * Number(disk.bsize); const minimum = Number(process.env.HALDUR_RUNTIME_MIN_FREE_BYTES ?? "0"); const warning = Number(process.env.HALDUR_RUNTIME_WARN_FREE_BYTES ?? "0");
    return { status: minimum && freeBytes < minimum ? "critical" : warning && freeBytes < warning ? "warning" : "healthy", freeBytes, staging, journal, trash, audit };
  },
  async audit() {
    const { runtimeRoot } = await getHaldurWritableRoots();
    const entries = await inventory(path.join(runtimeRoot, "audit"));
    const records = await Promise.all(entries.filter((item) => item.name.endsWith(".json")).map(async (item) => { try { return JSON.parse(await fs.readFile(path.join(runtimeRoot, "audit", item.name), "utf8")); } catch { return null; } }));
    return records.filter(Boolean).sort((left: any, right: any) => String(right.startedAt ?? "").localeCompare(String(left.startedAt ?? ""))).slice(0, 100);
  }
};
