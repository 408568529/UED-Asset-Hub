import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateDshRuntimeSource, validateDshSource } from "../agent-integration/scripts/dsh-source-validator.mjs";

const [authoritySourceDir, runtimeSourceDir] = process.argv.slice(2);
if (!authoritySourceDir || !runtimeSourceDir || process.argv.length !== 4) throw new Error("Usage: node scripts/verify-dsh-runtime-source.mjs <authoritative-source> <runtime-source>");

const projectDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const expected = JSON.parse(await readFile(path.join(projectDir, "agent-integration", "dsh", "version.json"), "utf8"));
const authority = await validateDshSource(authoritySourceDir, expected, { readOnly: true });
const runtime = await validateDshRuntimeSource(authoritySourceDir, runtimeSourceDir);
console.log(JSON.stringify({ result: "PASS", authoritative: authority, runtime }));
