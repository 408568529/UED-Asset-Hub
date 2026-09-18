import { probeDshSessionList } from "./runtime-readiness.mjs";

try {
  await probeDshSessionList();
  console.log("[UED Agent] DSH runtime connection check passed.");
} catch (error) {
  console.error("[UED Agent] DSH runtime is unavailable:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
