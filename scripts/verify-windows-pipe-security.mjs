import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.platform !== "win32" || process.arch !== "x64") {
  console.log("[UED Agent] Windows Pipe Security native evidence: NOT RUN (requires Windows x64).");
  process.exit(0);
}

const harness = await readFile(path.join(root, "scripts", "windows-service-runtime-control-harness.ps1"), "utf8");
if (!harness.includes("PIPE_REJECT_REMOTE_CLIENTS") || !harness.includes("GetNamedPipeClientProcessId")) throw new Error("Windows service runtime-control harness is incomplete.");
console.log("[UED Agent] Windows Pipe Security native harness is prepared; execute it on Block E staging only.");
