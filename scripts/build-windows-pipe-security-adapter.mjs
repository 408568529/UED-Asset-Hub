import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "native", "windows-pipe-security-adapter", "ued_windows_pipe_security_adapter.cpp");
const outputDirectory = path.join(root, "native", "windows-pipe-security-adapter", "bin");
const output = path.join(outputDirectory, "ued-windows-pipe-security-adapter.exe");
const manifest = path.join(outputDirectory, "ued-windows-pipe-security-adapter.manifest.json");

if (process.platform !== "win32" || process.arch !== "x64") {
  console.log("[UED Agent] Windows Pipe Security Adapter build: NOT RUN (requires Windows x64 MSVC).");
  process.exit(0);
}

await mkdir(outputDirectory, { recursive: true });
const compiler = process.env.CXX || "cl.exe";
const result = spawnSync(compiler, ["/nologo", "/std:c++17", "/EHsc", "/O2", "/W4", source, "/link", "/OUT:" + output, "Advapi32.lib"], { cwd: root, stdio: "inherit", shell: false });
if (result.status !== 0) process.exit(result.status || 1);
const executable = await readFile(output);
const sha256 = createHash("sha256").update(executable).digest("hex");
await writeFile(manifest, `${JSON.stringify({ version: 1, architecture: "x64", sha256 }, null, 2)}\n`, "utf8");
console.log(`[UED Agent] Built Windows Pipe Security Adapter: ${output}`);
