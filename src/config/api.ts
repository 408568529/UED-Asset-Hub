export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false";

export type AIProvider = "openai" | "claude" | "gemini" | "deepseek" | "custom";

export const aiProviderConfig = {
  provider: "openai" as AIProvider,
  baseUrl: process.env.OPENAI_BASE_URL ?? "",
  model: process.env.OPENAI_MODEL ?? "",
  // Server-only. Never expose this in client components.
  apiKeyEnv: "OPENAI_API_KEY"
};
