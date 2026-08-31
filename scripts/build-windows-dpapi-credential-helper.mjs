import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(root, "native", "windows-dpapi-credential-helper", "bin");
const output = path.join(directory, "ued-windows-dpapi-credential-helper.exe");
if (process.platform !== "win32" || process.arch !== "x64") { console.log("[UED Agent] DPAPI Credential Helper build: NOT RUN (requires Windows x64 MSVC)."); process.exit(0); }
await mkdir(directory, { recursive: true });
const result = spawnSync("cl.exe", ["/nologo", "/std:c++17", "/EHsc", "/O2", path.join(root, "native", "windows-dpapi-credential-helper", "ued_windows_dpapi_credential_helper.cpp"), "/link", "/OUT:" + output, "Crypt32.lib"], { cwd: root, stdio: "inherit", shell: false });
if (result.status !== 0) process.exit(result.status || 1);
await writeFile(path.join(directory, "ued-windows-dpapi-credential-helper.manifest.json"), JSON.stringify({ version: 1, architecture: "x64", sha256: createHash("sha256").update(await readFile(output)).digest("hex") }, null, 2) + "\n");
