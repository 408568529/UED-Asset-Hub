import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "native", "windows-job-helper", "ued_windows_job_helper.cpp");
const outputDir = path.join(root, "native", "windows-job-helper", "bin");
const output = path.join(outputDir, "ued-windows-job-helper.exe");
const manifest = path.join(outputDir, "ued-windows-job-helper.manifest.json");

if (process.platform !== "win32") {
  console.log("[UED Agent] Windows Job Helper build: NOT RUN (requires Windows x64 MSVC).");
  process.exit(0);
}

await access(source);
await mkdir(outputDir, { recursive: true });
const compiler = spawn("cl.exe", ["/nologo", "/std:c++17", "/EHsc", "/O2", `/Fe:${output}`, source], { cwd: root, stdio: "inherit", shell: false });
const code = await new Promise((resolve) => compiler.once("exit", resolve));
if (code !== 0) throw new Error("Windows Job Helper build failed. Run from an x64 Native Tools command prompt.");
const sha256 = createHash("sha256").update(await readFile(output)).digest("hex");
await writeFile(manifest, JSON.stringify({ version: 1, architecture: "x64", sha256, binary: path.basename(output) }, null, 2) + "\n", { mode: 0o600 });
console.log(`[UED Agent] Windows Job Helper built: ${output}`);
