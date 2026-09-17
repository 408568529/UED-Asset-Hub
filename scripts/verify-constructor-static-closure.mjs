import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "scripts", "windows-release-constructor.mjs");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const imports = /import\s+(?:([^\n;]*?)\s+from\s+)?["'](\.[^"']+)["'];/g;
const requiredExports = (clause) => clause?.match(/\{([^}]+)\}/)?.[1].split(",").map((item) => item.trim().split(/\s+as\s+/)[0]).filter(Boolean) ?? [];
const modules = new Map(); const failures = [];
async function visit(file) {
  if (modules.has(file)) return;
  let text; try { text = await readFile(file, "utf8"); } catch { failures.push({ type: "MISSING_IMPORTED_MODULE", file }); return; }
  const item = { path: path.relative(root, file).replaceAll("\\", "/"), sha256: sha(text), imports: [] }; modules.set(file, item);
  for (const match of text.matchAll(imports)) {
    const resolved = path.resolve(path.dirname(file), match[2]); const target = path.extname(resolved) ? resolved : `${resolved}.mjs`; const names = requiredExports(match[1]);
    item.imports.push({ path: path.relative(root, target).replaceAll("\\", "/"), names });
    let imported; try { imported = await readFile(target, "utf8"); } catch { failures.push({ type: "MISSING_IMPORTED_MODULE", importer: item.path, path: item.imports.at(-1).path }); continue; }
    for (const name of names) if (!new RegExp(`export\\s+(?:async\\s+)?(?:function|const|class|let|var)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b`).test(imported)) failures.push({ type: "MISSING_NAMED_EXPORT", importer: item.path, path: item.imports.at(-1).path, name });
    await visit(target);
  }
  for (const match of text.matchAll(/const\s*\{([^}]+)\}\s*=\s*await\s+import\(["'](\.[^"']+)["']\)/g)) {
    const target = path.resolve(path.dirname(file), match[2]); const names = match[1].split(",").map((name) => name.trim()).filter(Boolean);
    item.imports.push({ path: path.relative(root, target).replaceAll("\\", "/"), names });
    const imported = await readFile(target, "utf8");
    for (const name of names) if (!new RegExp(`export\\s+(?:async\\s+)?(?:function|const|class|let|var)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b`).test(imported)) failures.push({ type: "MISSING_NAMED_EXPORT", importer: item.path, path: item.imports.at(-1).path, name });
    await visit(target);
  }
}
await visit(entry);
const snapshotManifestPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
let snapshotCoverage = "NOT_CHECKED";
if (snapshotManifestPath) { const manifest = JSON.parse(await readFile(snapshotManifestPath, "utf8")); const members = new Set(manifest.files.map((file) => file.relativePath)); for (const item of modules.values()) if (!members.has(item.path)) failures.push({ type: "MISSING_SNAPSHOT_MEMBER", path: item.path }); snapshotCoverage = failures.some((item) => item.type === "MISSING_SNAPSHOT_MEMBER") ? "FAIL" : "PASS"; }
const report = { schemaVersion: 1, entry: path.relative(root, entry), modules: [...modules.values()].map(({ path: itemPath, sha256: digest, imports: localImports }) => ({ path: itemPath, sha256: digest, imports: localImports })), identityCoverage: ["source-classification", "source-commit", "source-archive-sha256", "source-snapshot-manifest", "dsh-source-root", "dsh-provenance-evidence", "native-set-root", "node-root", "creation-run-id"], snapshotCoverage, failures, result: failures.length ? "STATIC_SOURCE_CLOSURE_FAIL" : "PASS" };
const output = path.join(root, "evidence", "g015"); await mkdir(output, { recursive: true }); await writeFile(path.join(output, "constructor-static-closure-report.json"), `${JSON.stringify(report, null, 2)}\n`); await writeFile(path.join(output, "constructor-static-closure-report.md"), `# Constructor Static Source Closure\n\nResult: **${report.result}**\n\nModules: ${report.modules.length}\n\nSnapshot coverage: ${snapshotCoverage}\n\nFailures: ${failures.length}\n`);
console.log(JSON.stringify({ result: report.result, modules: report.modules.length, failures: failures.length, snapshotCoverage })); if (failures.length) process.exitCode = 1;
