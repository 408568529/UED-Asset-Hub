import { createHash } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const fingerprintFiles = ["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml", "apps/cli/package.json", "apps/cli/src/bin.ts", "packages/bundle/base/cordis.patch.yml", "packages/bundle/web-app/cordis.patch.yml", "packages/mcp/mcp-client/src/index.ts"];

export async function validateDshSource(sourceDir, expected) {
  const manifestPath = path.join(sourceDir, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.version !== expected.version) throw new Error(`DSH 版本不兼容。期望 ${expected.version}，实际 ${manifest.version ?? "未知"}。`);
  for (const required of ["pnpm-workspace.yaml", "apps/cli/package.json", "apps/cli/src/bin.ts", "packages/mcp/mcp-client/src/index.ts"]) {
    try { await access(path.join(sourceDir, required)); } catch { throw new Error(`DSH Source 缺少必要结构：${required}`); }
  }
  const hash = createHash("sha256");
  for (const relative of fingerprintFiles) {
    try { hash.update(relative); hash.update(await readFile(path.join(sourceDir, relative))); } catch (error) { if (relative !== "pnpm-lock.yaml") throw error; }
  }
  const gitDir = path.join(sourceDir, ".git");
  let sourceType = "local";
  let commit = null;
  let hasGitDirectory = false;
  try { hasGitDirectory = (await stat(gitDir)).isDirectory(); } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (hasGitDirectory) {
      sourceType = "git";
      const result = spawnSync("git", ["-C", sourceDir, "rev-parse", "HEAD"], { encoding: "utf8" });
      if (result.status !== 0) throw new Error("无法读取 DSH Git HEAD。");
      commit = result.stdout.trim();
      if (expected.sourceCommit && commit !== expected.sourceCommit) throw new Error("DSH Git HEAD 不符合兼容性基线。");
  }
  return { sourceType, version: manifest.version, commit, fingerprint: hash.digest("hex"), compatibilityBaseline: expected.compatibilityBaseline };
}
