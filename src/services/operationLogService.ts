import { readJsonFile, writeJsonFile } from "@/lib/storage/jsonStorage";
import type { OperationLog } from "@/types/audit";

const FILE_NAME = "logs.json";

type OperationLogInput = Omit<OperationLog, "id" | "createdAt"> & { createdAt?: string };

export const operationLogService = {
  async getLogs(limit?: number): Promise<OperationLog[]> {
    const logs = await readJsonFile<OperationLog[]>(FILE_NAME, []);
    const result = logs.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    return limit ? result.slice(0, limit) : result;
  },

  async createLog(input: OperationLogInput): Promise<OperationLog> {
    const logs = await readJsonFile<OperationLog[]>(FILE_NAME, []);
    const log: OperationLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: input.createdAt ?? new Date().toISOString(),
      ...input
    };
    await writeJsonFile(FILE_NAME, [log, ...logs]);
    return log;
  }
};
