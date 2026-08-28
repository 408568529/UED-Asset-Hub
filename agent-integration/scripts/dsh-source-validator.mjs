import { createHash } from "node:crypto";
import { access, lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const fingerprintFiles = ["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml", "apps/cli/package.json", "apps/cli/src/bin.ts", "packages/bundle/base/cordis.patch.yml", "packages/bundle/web-app/cordis.patch.yml", "packages/mcp/mcp-client/src/index.ts"];

function runGit(sourceDir, args, message) {
  const result = spawnSync("git", ["-C", sourceDir, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(message);
  return result.stdout.trim();
}

export async function validateDshSource(sourceDir, expected) {
  const configuredSourceDir = path.resolve(sourceDir);
  const canonicalSourceDir = await realpath(configuredSourceDir);
  if (configuredSourceDir !== canonicalSourceDir) throw new Error("DSH Source 不允许使用符号链接或路径别名。");

  const gitDir = path.join(canonicalSourceDir, ".git");
  let gitDirectory;
  try {
    gitDirectory = await lstat(gitDir);
  } catch {
    throw new Error("DSH Source 必须包含独立的 .git 目录。");
  }
  if (!gitDirectory.isDirectory() || gitDirectory.isSymbolicLink()) throw new Error("DSH Source 必须包含独立的 .git 目录。");

  if (runGit(canonicalSourceDir, ["rev-parse", "--is-inside-work-tree"], "无法验证 DSH Git Repository。") !== "true") {
    throw new Error("DSH Source 不是有效 Git Repository。");
  }
  const topLevel = await realpath(runGit(canonicalSourceDir, ["rev-parse", "--show-toplevel"], "无法读取 DSH Git 根目录。"));
  if (topLevel !== canonicalSourceDir) throw new Error("DSH Source 必须是独立 Git Repository 根目录。");

  const origin = runGit(canonicalSourceDir, ["remote", "get-url", "origin"], "DSH Source 缺少 origin。");
  if (origin !== expected.sourceRepository) throw new Error("DSH Git origin 不符合官方仓库锁定。");

  const commit = runGit(canonicalSourceDir, ["rev-parse", "HEAD"], "无法读取 DSH Git HEAD。");
  if (commit !== expected.sourceCommit) throw new Error("DSH Git HEAD 不符合兼容性基线。");

  if (runGit(canonicalSourceDir, ["status", "--porcelain=v1", "--untracked-files=all"], "无法读取 DSH Git working tree 状态。")) {
    throw new Error("DSH Git working tree 必须保持 clean，且不得包含 untracked 文件。");
  }

  const manifestPath = path.join(canonicalSourceDir, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.version !== expected.version) throw new Error(`DSH 版本不兼容。期望 ${expected.version}，实际 ${manifest.version ?? "未知"}。`);
  for (const required of ["pnpm-workspace.yaml", "apps/cli/package.json", "apps/cli/src/bin.ts", "packages/mcp/mcp-client/src/index.ts"]) {
    try {
      await access(path.join(canonicalSourceDir, required));
    } catch {
      throw new Error(`DSH Source 缺少必要结构：${required}`);
    }
  }

  const hash = createHash("sha256");
  for (const relative of fingerprintFiles) {
    try {
      hash.update(relative);
      hash.update(await readFile(path.join(canonicalSourceDir, relative)));
    } catch (error) {
      if (relative !== "pnpm-lock.yaml") throw error;
    }
  }
  const fingerprint = hash.digest("hex");
  if (expected.fingerprint && fingerprint !== expected.fingerprint) throw new Error("DSH Source fingerprint 不符合锁定值。");

  return { sourceType: "git", version: manifest.version, commit, fingerprint, compatibilityBaseline: expected.compatibilityBaseline };
}
