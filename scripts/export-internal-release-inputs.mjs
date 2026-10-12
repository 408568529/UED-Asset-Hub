import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || values[key.slice(2)]) throw new Error("Arguments must be unique --name value pairs.");
    values[key.slice(2)] = value;
  }
  for (const name of ["repo", "commit", "output-dir"]) if (!values[name]) throw new Error(`Missing --${name}.`);
  if (!/^[a-f0-9]{40}$/.test(values.commit)) throw new Error("--commit must be a full Git SHA.");
  return { repo: values.repo, commit: values.commit, outputDir: values["output-dir"] };
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve(Buffer.concat(stdout).toString("utf8").trim()) : reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `${command} exited ${code}`)));
  });
}

export async function exportInternalReleaseInputs({ repo, commit, outputDir }) {
  const repository = await realpath(repo);
  const output = path.resolve(outputDir);
  const outputRelative = path.relative(repository, output);
  if (outputRelative === "" || (!outputRelative.startsWith(`..${path.sep}`) && outputRelative !== ".." && !path.isAbsolute(outputRelative))) throw new Error("Input bundles must be written outside the source repository.");
  const head = await run("git", ["rev-parse", "HEAD"], repository);
  if (head !== commit) throw new Error("Release source worktree HEAD does not match --commit.");
  const status = await run("git", ["status", "--porcelain=v1"], repository);
  if (status) throw new Error("Release source worktree must be clean.");
  const tree = await run("git", ["rev-parse", `${commit}^{tree}`], repository);
  await mkdir(output, { recursive: true });
  const bundlePath = path.join(output, `ued-asset-hub-${commit}.bundle`);
  await run("git", ["bundle", "create", bundlePath, "HEAD"], repository);
  await run("git", ["bundle", "verify", bundlePath], repository);
  const bundle = await readFile(bundlePath);
  const identity = {
    schemaVersion: 1,
    channel: "INTERNAL_RELEASE_INPUT",
    commit,
    tree,
    bundle: path.basename(bundlePath),
    bundleBytes: bundle.length,
    bundleSha256: createHash("sha256").update(bundle).digest("hex")
  };
  await writeFile(path.join(output, "source-input.json"), `${JSON.stringify(identity, null, 2)}\n`, { flag: "wx" });
  return { bundlePath, identityPath: path.join(output, "source-input.json"), identity };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await exportInternalReleaseInputs(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({ commit: result.identity.commit, tree: result.identity.tree, bundle: result.bundlePath, bundleSha256: result.identity.bundleSha256 })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
