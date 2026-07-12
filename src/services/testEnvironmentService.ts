import { decryptServerValue, encryptServerValue } from "@/lib/serverEncryption";
import { readJsonFile, writeJsonFile } from "@/lib/storage/jsonStorage";
import { operationLogService } from "@/services/operationLogService";
import type { DeleteResult, MutationResult } from "@/types/serviceResult";
import type { SafeTestEnvironment, TestEnvironment, TestEnvironmentInput } from "@/types/testEnvironment";

const FILE_NAME = "test-environments.json";

function createId(name: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "")}-${Date.now()}`;
}

function toSafe(environment: TestEnvironment): SafeTestEnvironment {
  const { encryptedPassword: _, ...safeEnvironment } = environment;
  return safeEnvironment;
}

function matches(environment: TestEnvironment, keyword?: string) {
  const normalized = keyword?.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [environment.productName, environment.clientVersionName, environment.environmentName, environment.environmentUrl, environment.username, environment.description, ...(environment.tags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase()
    .includes(normalized);
}

async function captureWarning(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    console.error(error);
    return "测试环境操作已完成，但日志写入失败。";
  }
  return undefined;
}

export const testEnvironmentService = {
  async getProducts() {
    const environments = await readJsonFile<TestEnvironment[]>(FILE_NAME, []);
    return [...new Set(environments.map((item) => item.productName))].sort();
  },

  async getEnvironments(keyword?: string): Promise<SafeTestEnvironment[]> {
    const environments = await readJsonFile<TestEnvironment[]>(FILE_NAME, []);
    return environments
      .filter((environment) => matches(environment, keyword))
      .sort((a, b) => a.productName.localeCompare(b.productName) || a.clientVersionName.localeCompare(b.clientVersionName) || +new Date(b.updatedAt) - +new Date(a.updatedAt))
      .map(toSafe);
  },

  async getEnvironmentById(id: string) {
    const environments = await readJsonFile<TestEnvironment[]>(FILE_NAME, []);
    const environment = environments.find((item) => item.id === id);
    return environment ? toSafe(environment) : null;
  },

  async countEnvironments() {
    return (await readJsonFile<TestEnvironment[]>(FILE_NAME, [])).length;
  },

  async createEnvironment(input: TestEnvironmentInput, operator = "admin"): Promise<MutationResult<SafeTestEnvironment>> {
    if (!input.password) throw new Error("测试密码为必填项。");
    const environments = await readJsonFile<TestEnvironment[]>(FILE_NAME, []);
    const now = new Date().toISOString();
    const environment: TestEnvironment = {
      id: createId(input.environmentName || input.productName),
      productName: input.productName,
      clientVersionName: input.clientVersionName,
      environmentType: input.environmentType,
      environmentName: input.environmentName?.trim() || `${input.productName} ${input.clientVersionName} ${input.environmentType}`,
      environmentUrl: input.environmentUrl,
      username: input.username,
      encryptedPassword: encryptServerValue(input.password),
      description: input.description,
      tags: input.tags ?? [],
      status: input.status ?? "available",
      createdBy: operator,
      createdAt: now,
      updatedAt: now
    };
    await writeJsonFile(FILE_NAME, [environment, ...environments]);
    const warning = await captureWarning(() => operationLogService.createLog({
      type: "create",
      title: `新增测试环境：${environment.environmentName}`,
      description: `${environment.productName} / ${environment.clientVersionName} / ${environment.environmentType}`,
      targetType: "credential",
      targetId: environment.id,
      targetName: environment.environmentName,
      operator,
      diffSummary: ["创建测试环境，密码已加密保存"]
    }).then(() => undefined));
    return { data: toSafe(environment), warning };
  },

  async updateEnvironment(id: string, input: TestEnvironmentInput, operator = "admin"): Promise<MutationResult<SafeTestEnvironment> | null> {
    const environments = await readJsonFile<TestEnvironment[]>(FILE_NAME, []);
    const index = environments.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const previous = environments[index];
    const environment: TestEnvironment = {
      ...previous,
      productName: input.productName,
      clientVersionName: input.clientVersionName,
      environmentType: input.environmentType,
      environmentName: input.environmentName?.trim() || `${input.productName} ${input.clientVersionName} ${input.environmentType}`,
      environmentUrl: input.environmentUrl,
      username: input.username,
      encryptedPassword: input.password ? encryptServerValue(input.password) : previous.encryptedPassword,
      description: input.description,
      tags: input.tags ?? [],
      status: input.status ?? previous.status,
      updatedAt: new Date().toISOString()
    };
    environments[index] = environment;
    await writeJsonFile(FILE_NAME, environments);
    const warning = await captureWarning(() => operationLogService.createLog({
      type: "update",
      title: `编辑测试环境：${environment.environmentName}`,
      description: `${environment.productName} / ${environment.clientVersionName}`,
      targetType: "credential",
      targetId: environment.id,
      targetName: environment.environmentName,
      operator,
      diffSummary: input.password ? ["更新环境信息", "测试密码已重新加密"] : ["更新环境信息"]
    }).then(() => undefined));
    return { data: toSafe(environment), warning };
  },

  async deleteEnvironment(id: string, operator = "admin"): Promise<DeleteResult> {
    const environments = await readJsonFile<TestEnvironment[]>(FILE_NAME, []);
    const environment = environments.find((item) => item.id === id);
    if (!environment) return { deleted: false };
    await writeJsonFile(FILE_NAME, environments.filter((item) => item.id !== id));
    const warning = await captureWarning(() => operationLogService.createLog({
      type: "delete",
      title: `删除测试环境：${environment.environmentName}`,
      description: `${environment.productName} / ${environment.clientVersionName}`,
      targetType: "credential",
      targetId: id,
      targetName: environment.environmentName,
      operator,
      diffSummary: ["删除测试环境，日志未记录密码明文"]
    }).then(() => undefined));
    return { deleted: true, warning };
  },

  async revealPassword(id: string, operator = "admin", action: "reveal" | "copy-password" = "reveal") {
    const environments = await readJsonFile<TestEnvironment[]>(FILE_NAME, []);
    const environment = environments.find((item) => item.id === id);
    if (!environment) return null;
    const password = decryptServerValue(environment.encryptedPassword);
    const warning = await captureWarning(() => operationLogService.createLog({
      type: action === "reveal" ? "view" : "copy",
      title: action === "reveal" ? `查看测试密码：${environment.environmentName}` : `复制测试密码：${environment.environmentName}`,
      description: `${environment.productName} / ${environment.clientVersionName}，日志未记录密码明文`,
      targetType: "credential",
      targetId: id,
      targetName: environment.environmentName,
      operator
    }).then(() => undefined));
    return { password, warning };
  },

  async logUsernameCopy(id: string, operator = "admin") {
    const environment = (await readJsonFile<TestEnvironment[]>(FILE_NAME, [])).find((item) => item.id === id);
    if (!environment) return false;
    await operationLogService.createLog({
      type: "copy",
      title: `复制测试账号：${environment.environmentName}`,
      description: `${environment.productName} / ${environment.clientVersionName}`,
      targetType: "credential",
      targetId: id,
      targetName: environment.environmentName,
      operator
    });
    return true;
  }
};
