import { randomUUID } from "node:crypto";

const baseUrl = process.env.DSH_BASE_URL || "http://127.0.0.1:3080";
const url = new URL("/api/session.list", baseUrl);
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 3000);

try {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "client-request", rpcId: randomUUID(), method: "session.list", payload: {} }),
    signal: controller.signal
  });
  const body = await response.json();
  if (!response.ok || body?.result?.ok !== true) throw new Error("DSH did not accept session.list");
  console.log("[UED Agent] DSH runtime connection check passed.");
} catch (error) {
  console.error("[UED Agent] DSH runtime is unavailable:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
