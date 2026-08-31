import { readOperationalJson, writeOperationalJson } from "@/lib/storage/operationalStorage";
import { readJsonFileReadonly } from "@/lib/storage/jsonStorage";
import type { OperationLog } from "@/types/audit";

const FILE_NAME = "logs.json";

type OperationLogInput = Omit<OperationLog, "id" | "createdAt"> & { createdAt?: string };

export const operationLogService = {
  async getLogs(limit?: number): Promise<OperationLog[]> {
    const [legacyLogs, operationalLogs] = await Promise.all([
      readJsonFileReadonly<OperationLog[]>(FILE_NAME, []),
      readOperationalJson<OperationLog[]>("logs", FILE_NAME, [])
    ]);
    const logs = [...legacyLogs, ...operationalLogs];
    const result = logs.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    return limit ? result.slice(0, limit) : result;
  },

  async createLog(input: OperationLogInput): Promise<OperationLog> {
    const logs = await readOperationalJson<OperationLog[]>("logs", FILE_NAME, []);
    const log: OperationLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: input.createdAt ?? new Date().toISOString(),
      ...input
    };
    await writeOperationalJson("logs", FILE_NAME, [log, ...logs].slice(0, 5_000));
    return log;
  }
};
