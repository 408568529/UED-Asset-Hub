import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "");
if (!root) throw new Error("missing workspace root.");
const config = await readFile(path.join(root, "next.config.ts"), "utf8");
if (!/output:\s*["']standalone["']/u.test(config)) throw new Error("G-021 standalone mode is not enabled.");
for (const relative of [".next/standalone", ".next/standalone/server.js", ".next/static", ".next/BUILD_ID", ".next/required-server-files.json", ".next/routes-manifest.json"]) {
  try { await access(path.join(root, ...relative.split("/"))); } catch { throw new Error(`G-021 required output is missing: ${relative}`); }
}
if (!(await stat(path.join(root, ".next", "standalone"))).isDirectory()) throw new Error("G-021 standalone output is not a directory.");
process.stdout.write(JSON.stringify({ result: "PASS", config: "next.config.ts", output: "standalone" }) + "\n");
