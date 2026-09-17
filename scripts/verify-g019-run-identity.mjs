import { readFile } from "node:fs/promises";

function values(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || result[key]) throw new Error("run identity arguments are invalid.");
    result[key] = value;
  }
  return result;
}

const args = values(process.argv.slice(2));
for (const key of ["--snapshot-manifest", "--windows-run-id", "--constructor-run-id", "--evidence-run-id"]) if (!args[key]) throw new Error(`missing ${key}`);
const snapshot = JSON.parse(await readFile(args["--snapshot-manifest"], "utf8"));
const identities = [snapshot.creationRunId, args["--windows-run-id"], args["--constructor-run-id"], args["--evidence-run-id"]];
if (!identities.every((value) => /^[a-z0-9-]+$/i.test(value)) || new Set(identities).size !== 1) throw new Error("G-019 Run Identity Preflight failed.");
process.stdout.write(`${JSON.stringify({ result: "PASS", runId: identities[0] })}\n`);
