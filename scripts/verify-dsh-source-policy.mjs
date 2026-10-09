import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveAllowedDshSourcePath } from "../agent-integration/scripts/dsh-source-policy.mjs";
import { validateDshRuntimeSource, validateDshSource } from "../agent-integration/scripts/dsh-source-validator.mjs";

const officialOrigin = "https://github.com/deepseek-ai/deepseek-harness.git";

function git(directory, args) {
  return execFileSync("git", ["-C", directory, ...args], { encoding: "utf8" }).trim();
}

async function writeDshStructure(directory, version = "0.1.1-rc.2") {
  const files = {
    "package.json": `${JSON.stringify({ name: "deepseek-harness", version }, null, 2)}\n`,
    "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
    "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    "apps/cli/package.json": `${JSON.stringify({ name: "@deepseek-ai/dsh-cli" })}\n`,
    "apps/cli/src/bin.ts": "export {};\n",
    "packages/bundle/base/cordis.patch.yml": "plugins: []\n",
    "packages/bundle/web-app/cordis.patch.yml": "plugins: []\n",
    "packages/mcp/mcp-client/src/index.ts": "export {};\n"
  };
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(directory, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents, "utf8");
  }
}

async function createDshSource(directory, { origin = officialOrigin, version } = {}) {
  await mkdir(directory, { recursive: true });
  await writeDshStructure(directory, version);
  git(directory, ["init", "-q"]);
  git(directory, ["config", "user.name", "UED Test"]);
  git(directory, ["config", "user.email", "ued-test@example.invalid"]);
  git(directory, ["add", "."]);
  git(directory, ["commit", "-qm", "fixture"]);
  git(directory, ["remote", "add", "origin", origin]);
  return {
    sourceRepository: officialOrigin,
    version: version ?? "0.1.1-rc.2",
    sourceCommit: git(directory, ["rev-parse", "HEAD"]),
    compatibilityBaseline: "test"
  };
}

async function expectFailure(action) {
  await assert.rejects(action, Error);
}

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "ued-dsh-source-policy-"));
const root = await realpath(temporaryRoot);
try {
  const projectDir = path.join(root, "asset-hub");
  const externalSource = path.join(root, "external-dsh");
  await mkdir(projectDir, { recursive: true });
  const expected = await createDshSource(externalSource);
  const valid = await validateDshSource(externalSource, expected, { readOnly: true });
  assert.equal(valid.sourceType, "git");
  assert.equal(await resolveAllowedDshSourcePath(projectDir, externalSource), externalSource);
  console.log("[DSH Source] official external Git Source: PASS");

  const runtimeSource = path.join(root, "runtime-dsh");
  await cp(externalSource, runtimeSource, { recursive: true, filter: (entry) => path.basename(entry) !== ".git" });
  const runtime = await validateDshRuntimeSource(externalSource, runtimeSource);
  assert.equal(runtime.runtimeSourceDir, runtimeSource);
  await writeFile(path.join(runtimeSource, "package.json"), "{\"tampered\":true}\n", "utf8");
  await expectFailure(() => validateDshRuntimeSource(externalSource, runtimeSource));
  await writeDshStructure(runtimeSource);
  await mkdir(path.join(runtimeSource, ".git"));
  await expectFailure(() => validateDshRuntimeSource(externalSource, runtimeSource));
  await rm(path.join(runtimeSource, ".git"), { recursive: true, force: true });
  console.log("[DSH Source] isolated runtime source matches the authoritative tracked baseline and rejects tampering or .git: PASS");

  const vendorSource = path.join(projectDir, "vendor", "deepseek-harness");
  const vendorExpected = await createDshSource(vendorSource);
  assert.equal(await resolveAllowedDshSourcePath(projectDir, vendorSource), vendorSource);
  await assert.doesNotReject(validateDshSource(vendorSource, vendorExpected, { readOnly: true }));
  console.log("[DSH Source] exact vendor/deepseek-harness: PASS");

  const disallowedSource = path.join(projectDir, "tools", "deepseek-harness");
  await createDshSource(disallowedSource);
  await expectFailure(() => resolveAllowedDshSourcePath(projectDir, disallowedSource));

  const missingGitSource = path.join(root, "missing-git");
  await mkdir(missingGitSource, { recursive: true });
  await writeDshStructure(missingGitSource);
  await expectFailure(() => validateDshSource(missingGitSource, expected));

  const nonIndependentSource = path.join(projectDir, "non-independent");
  await writeDshStructure(nonIndependentSource);
  git(projectDir, ["init", "-q"]);
  await expectFailure(() => validateDshSource(nonIndependentSource, expected));

  const wrongOriginSource = path.join(root, "wrong-origin");
  const wrongOriginExpected = await createDshSource(wrongOriginSource, { origin: "https://example.invalid/deepseek-harness.git" });
  const classifiedOrigin = await validateDshSource(wrongOriginSource, wrongOriginExpected, { readOnly: true });
  assert.equal(classifiedOrigin.originClassification, "other");

  await expectFailure(() => validateDshSource(externalSource, { ...expected, sourceCommit: "0".repeat(40) }));
  await expectFailure(() => validateDshSource(externalSource, { ...expected, version: "0.0.0" }));
  await expectFailure(() => validateDshSource(externalSource, { ...expected, fingerprint: "0".repeat(64) }));

  await writeFile(path.join(externalSource, "package.json"), "{\"name\":\"dirty\"}\n", "utf8");
  await expectFailure(() => validateDshSource(externalSource, expected));
  git(externalSource, ["checkout", "--", "package.json"]);
  await writeFile(path.join(externalSource, "untracked.txt"), "untracked\n", "utf8");
  await expectFailure(() => validateDshSource(externalSource, expected));
  git(externalSource, ["clean", "-f"]);

  const symlinkPath = path.join(projectDir, "vendor", "symlink-source");
  await symlink(externalSource, symlinkPath);
  await expectFailure(() => resolveAllowedDshSourcePath(projectDir, symlinkPath));
  console.log("[DSH Source] reject non-independent, commit, version, fingerprint, dirty, untracked, and symlink paths; classify non-official origin without weakening identity: PASS");
} finally {
  await rm(root, { recursive: true, force: true });
}
