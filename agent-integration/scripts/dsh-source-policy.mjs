import { realpath } from "node:fs/promises";
import path from "node:path";

function isInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === "" || (!path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`) && relative !== "..");
}

export async function resolveAllowedDshSourcePath(projectDir, sourceDir) {
  const configuredSourceDir = path.resolve(sourceDir);
  const [canonicalProjectDir, canonicalSourceDir] = await Promise.all([realpath(projectDir), realpath(configuredSourceDir)]);
  const vendorSourceDir = path.join(canonicalProjectDir, "vendor", "deepseek-harness");

  if (configuredSourceDir !== canonicalSourceDir) {
    throw new Error("DSH_SOURCE_DIR 不允许使用符号链接或路径别名。");
  }
  if (isInside(canonicalProjectDir, canonicalSourceDir) && canonicalSourceDir !== vendorSourceDir) {
    throw new Error("DSH_SOURCE_DIR 位于 Asset Hub Git 目录内时，只允许 vendor/deepseek-harness。");
  }

  return canonicalSourceDir;
}
