export type TestEnvironmentType = "UAT" | "TEST" | "DEMO" | "OTHER";
export type TestEnvironmentStatus = "available" | "maintenance" | "disabled";

export interface TestEnvironment {
  id: string;
  productName: string;
  clientVersionName: string;
  environmentType: TestEnvironmentType;
  environmentName: string;
  environmentUrl?: string;
  username: string;
  encryptedPassword: string;
  description?: string;
  tags: string[];
  tagIds?: string[];
  sortOrder?: number;
  status: TestEnvironmentStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type SafeTestEnvironment = Omit<TestEnvironment, "encryptedPassword">;

export interface TestEnvironmentInput {
  productName: string;
  clientVersionName: string;
  environmentType: TestEnvironmentType;
  environmentName?: string;
  environmentUrl?: string;
  username: string;
  password?: string;
  description?: string;
  tags: string[];
  tagIds?: string[];
  status?: TestEnvironmentStatus;
}
