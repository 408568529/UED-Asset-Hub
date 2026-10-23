import { createHash } from "node:crypto";
import { access, lstat, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const manifestName = "release-manifest.json";
const compareUtf8 = (left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function fail(message) { throw new Error(`Internal release contract: ${message}`); }

function normalizedPath(value) {
  if (typeof value !== "string" || !value || value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) fail("manifest contains an unsafe relative path.");
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.includes(":") || /[. ]$/.test(part))) fail("manifest contains an unsafe relative path.");
  if (parts.some((part) => part.toLowerCase() === ".git" || /^\.env(?:\.|$)/i.test(part) && part.toLowerCase() !== ".env.example")) fail("manifest contains a forbidden path.");
  return parts.join("/");
}

async function regularFiles(root) {
  const canonicalRoot = await realpath(root);
  const files = [];
  async function visit(directory, prefix = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareUtf8(left.name, right.name));
    for (const entry of entries) {
      const relative = normalizedPath(prefix ? `${prefix}/${entry.name}` : entry.name);
      if (relative === manifestName) continue;
      const absolute = path.join(directory, entry.name);
      const details = await lstat(absolute);
      if (details.isSymbolicLink() || (!details.isDirectory() && details.nlink > 1)) fail(`links are not allowed: ${relative}`);
      const physical = await realpath(absolute);
      const physicalRelative = path.relative(canonicalRoot, physical);
      if (physicalRelative.startsWith(`..${path.sep}`) || physicalRelative === ".." || path.isAbsolute(physicalRelative)) fail(`path escapes release root: ${relative}`);
      if (details.isDirectory()) await visit(absolute, relative);
      else if (details.isFile()) {
        if (/\.map$/i.test(relative)) fail(`source maps are not allowed in payload: ${relative}`);
        if (/\.(?:ts|tsx|mts|cts)$/i.test(relative) && (!relative.startsWith("node_modules/") || !/\.d\.(?:ts|mts|cts)$/i.test(relative))) fail(`development TypeScript source is not allowed in payload: ${relative}`);
        const bytes = await readFile(absolute);
        files.push({ path: relative, size: bytes.length, sha256: sha256(bytes) });
      } else fail(`unsupported file type: ${relative}`);
    }
  }
  await visit(canonicalRoot);
  files.sort((left, right) => compareUtf8(left.path, right.path));
  return files;
}

export async function deriveInternalRuntimeModuleClosure(sourceRoot, entrypoints) {
  // Source analysis runs on the build host; manifest verification does not need TypeScript.
  const { default: ts } = await import("typescript");
  const root = await realpath(sourceRoot);
  const pending = [...entrypoints];
  const visited = new Set();
  const extensions = [".mjs", ".js", ".cjs", ".json"];
  while (pending.length) {
    const relative = pending.pop();
    const safe = normalizedPath(relative);
    if (!safe.startsWith("scripts/") && !safe.startsWith("agent-integration/scripts/")) fail(`runtime module is outside approved roots: ${safe}`);
    if (visited.has(safe)) continue;
    visited.add(safe);
    const absolute = path.resolve(root, ...safe.split("/"));
    const physical = await realpath(absolute);
    const relativePhysical = path.relative(root, physical);
    if (relativePhysical.startsWith(`..${path.sep}`) || relativePhysical === ".." || path.isAbsolute(relativePhysical)) fail(`runtime module escapes source root: ${safe}`);
    const details = await lstat(absolute);
    if (!details.isFile() || details.isSymbolicLink()) fail(`runtime module is not a regular file: ${safe}`);
    const source = await readFile(absolute, "utf8");
    if (path.extname(absolute) === ".json") continue;
    const sourceFile = ts.createSourceFile(absolute, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    if (sourceFile.parseDiagnostics.length) fail(`runtime module cannot be parsed: ${safe}`);
    const specifiers = new Set();
    const visit = (node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifiers.add(node.moduleSpecifier.text);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) specifiers.add(node.arguments[0].text);
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    for (const specifier of specifiers) {
      if (!specifier.startsWith(".")) continue;
      const base = path.resolve(path.dirname(absolute), specifier);
      const baseRelative = path.relative(root, base);
      if (baseRelative === ".." || baseRelative.startsWith(`..${path.sep}`) || path.isAbsolute(baseRelative)) fail(`runtime import escapes source root: ${safe} -> ${specifier}`);
      const candidates = path.extname(base) ? [base] : [base, ...extensions.map((extension) => `${base}${extension}`), ...extensions.map((extension) => path.join(base, `index${extension}`))];
      let resolved = null;
      for (const candidate of candidates) {
        try { await access(candidate); resolved = candidate; break; } catch (error) { if (error.code !== "ENOENT") throw error; }
      }
      if (!resolved) fail(`runtime import is missing: ${safe} -> ${specifier}`);
      const resolvedRelative = path.relative(root, resolved).split(path.sep).join("/");
      pending.push(resolvedRelative);
    }
  }
  return [...visited].sort(compareUtf8);
}

export async function createInternalReleaseManifest({ payloadRoot, sourceCommit, sourceTree, releaseVersion, builtAtUtc, build, dsh }) {
  if (!/^[a-f0-9]{40}$/.test(sourceCommit) || !/^[a-f0-9]{40}$/.test(sourceTree)) fail("source identity is invalid.");
  if (typeof releaseVersion !== "string" || !/^internal-[a-z0-9.-]{1,80}$/.test(releaseVersion) || !Number.isFinite(Date.parse(builtAtUtc))) fail("internal version or build timestamp is invalid.");
  if (!build || !dsh || typeof build.node !== "string" || typeof build.npm !== "string" || typeof build.platform !== "string" || typeof build.visualStudio !== "string" || typeof build.msvcCompiler !== "string" || typeof dsh.version !== "string" || typeof dsh.packageManager !== "string" || typeof dsh.license !== "string" || !/^[a-f0-9]{40}$/.test(dsh.commit) || !/^[a-f0-9]{40}$/.test(dsh.tree)) fail("build or DSH identity is invalid.");
  const files = await regularFiles(payloadRoot);
  if (!files.some((file) => file.path === "server.js")) fail("standalone Hub server.js is missing.");
  if (!files.some((file) => file.path === "scripts/start-host.mjs")) fail("Host Supervisor entrypoint is missing.");
  if (!files.some((file) => file.path === "scripts/windows-graceful-bootstrap.mjs")) fail("Host child bootstrap entrypoint is missing.");
  if (!files.some((file) => file.path === "scripts/windows-managed-shutdown-client.mjs")) fail("managed shutdown client entrypoint is missing.");
  if (!files.some((file) => file.path === "scripts/internal-release-preflight.mjs")) fail("runtime path preflight is missing.");
  if (!files.some((file) => file.path === "agent-integration/scripts/start-agent-proxy.mjs")) fail("Agent Proxy entrypoint is missing.");
  if (!files.some((file) => file.path === "agent-integration/scripts/start-knowledge-gateway-mcp.mjs")) fail("Knowledge Gateway entrypoint is missing.");
  return {
    schemaVersion: 1,
    channel: "INTERNAL_RELEASE",
    releaseVersion,
    builtAtUtc,
    source: { commit: sourceCommit, tree: sourceTree },
    build,
    dsh,
    files,
    fileCount: files.length,
    totalBytes: files.reduce((total, file) => total + file.size, 0)
  };
}

export async function writeInternalReleaseManifest(options) {
  const manifest = await createInternalReleaseManifest(options);
  await writeFile(path.join(options.payloadRoot, manifestName), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  return manifest;
}

export async function verifyInternalReleaseManifest({ payloadRoot, manifest = null }) {
  const manifestPath = path.join(payloadRoot, manifestName);
  if (!manifest) {
    const details = await lstat(manifestPath);
    if (!details.isFile() || details.isSymbolicLink() || details.nlink > 1) fail("release manifest must be a regular, unlinked file.");
    const canonicalRoot = await realpath(payloadRoot);
    const canonicalManifest = await realpath(manifestPath);
    const relativeManifest = path.relative(canonicalRoot, canonicalManifest);
    if (relativeManifest !== manifestName) fail("release manifest path escapes the payload root.");
  }
  const actualManifest = manifest ?? JSON.parse(await readFile(manifestPath, "utf8"));
  if (actualManifest.schemaVersion !== 1 || actualManifest.channel !== "INTERNAL_RELEASE" || !/^internal-[a-z0-9.-]{1,80}$/.test(actualManifest.releaseVersion || "") || !Number.isFinite(Date.parse(actualManifest.builtAtUtc)) || !Array.isArray(actualManifest.files)) fail("manifest schema or release channel is invalid.");
  const expected = actualManifest.files.map((file) => ({ path: normalizedPath(file.path), size: file.size, sha256: file.sha256 }));
  if (new Set(expected.map((file) => file.path.toLowerCase())).size !== expected.length) fail("manifest has duplicate or case-colliding paths.");
  const actual = await regularFiles(payloadRoot);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) fail("payload files, sizes, or hashes differ from manifest.");
  if (actualManifest.fileCount !== actual.length || actualManifest.totalBytes !== actual.reduce((sum, file) => sum + file.size, 0)) fail("manifest totals are invalid.");
  return actualManifest;
}

export { manifestName, normalizedPath };

function parseCliArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || values[key.slice(2)]) fail("command arguments are invalid.");
    values[key.slice(2)] = value;
  }
  return values;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, ...argv] = process.argv.slice(2);
    const values = parseCliArgs(argv);
    if (action === "closure") {
      const modules = await deriveInternalRuntimeModuleClosure(values.root, [
        "scripts/start-host.mjs",
        "scripts/windows-graceful-bootstrap.mjs",
        "scripts/windows-managed-shutdown-client.mjs",
        "agent-integration/scripts/start-agent-proxy.mjs",
        "agent-integration/scripts/start-knowledge-gateway-mcp.mjs"
      ]);
      await writeFile(values.output, `${JSON.stringify(modules, null, 2)}\n`, { flag: "wx" });
      process.stdout.write(`${modules.length} runtime modules\n`);
    } else if (action === "manifest") {
      const manifest = await writeInternalReleaseManifest({
        payloadRoot: values.root,
        sourceCommit: values.sourceCommit,
        sourceTree: values.sourceTree,
        releaseVersion: values.releaseVersion,
        builtAtUtc: values.builtAtUtc,
        build: JSON.parse(await readFile(values.buildInfo, "utf8")),
        dsh: JSON.parse(await readFile(values.dshInfo, "utf8"))
      });
      process.stdout.write(`${JSON.stringify({ releaseVersion: manifest.releaseVersion, fileCount: manifest.fileCount, totalBytes: manifest.totalBytes })}\n`);
    } else if (action === "verify") {
      const manifest = await verifyInternalReleaseManifest({ payloadRoot: values.root });
      process.stdout.write(`${JSON.stringify({ result: "PASS", releaseVersion: manifest.releaseVersion, fileCount: manifest.fileCount })}\n`);
    } else fail("supported actions are closure, manifest, and verify.");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
