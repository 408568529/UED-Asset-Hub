import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function snapshot(root: string) {
  return readFile(path.join(root, "meta", "haldur-design-skill.json"), "utf8").catch(() => null);
}

function findNode(nodes: Array<{ relativePath: string; children?: unknown[] }>, relativePath: string): { relativePath: string; metadata?: { description?: string } } | undefined {
  for (const node of nodes) {
    if (node.relativePath === relativePath) return node;
    if (Array.isArray(node.children)) {
      const nested = findNode(node.children as Array<{ relativePath: string; children?: unknown[] }>, relativePath);
      if (nested) return nested;
    }
  }
  return undefined;
}

async function main() {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ued-haldur-data-"));
  const skillRoot = path.join(dataRoot, "haldur-design-skill");
  const runtimeRoot = path.join(dataRoot, "haldur-design-skill-runtime");
  let outsideRoot: string | undefined;
  process.env.DATA_DIR = dataRoot;
  process.env.HALDUR_DESIGN_SKILL_ROOT = skillRoot;
  process.env.HALDUR_DESIGN_SKILL_RUNTIME_ROOT = runtimeRoot;

  try {
  const { HaldurDesignSkillPathError, haldurDesignSkillService, normalizeHaldurRelativePath } = await import("@/services/haldurDesignSkillService");

  const missing = await haldurDesignSkillService.getSnapshot();
  assert.equal(missing.rootAvailable, false);
  assert.equal(existsSync(skillRoot), false, "read-only scan must not create a missing Root");

  await mkdir(path.join(skillRoot, "微规范", "表单"), { recursive: true });
  await mkdir(path.join(dataRoot, "meta"), { recursive: true });
  await writeFile(path.join(skillRoot, "SKILL.md"), "# Haldur\n");
  await writeFile(path.join(skillRoot, "微规范", "表单", "校验.md"), "initial\n");
  await writeFile(path.join(dataRoot, "meta", "haldur-design-skill.json"), JSON.stringify({
    schemaVersion: 1,
    entries: { "微规范/表单/校验.md": { description: "表单校验规则", tags: ["form"] } }
  }, null, 2));
  outsideRoot = await mkdtemp(path.join(os.tmpdir(), "ued-haldur-outside-"));
  await writeFile(path.join(outsideRoot, "secret.md"), "outside\n");
  await symlink(outsideRoot, path.join(skillRoot, "outside-link"), "dir");

  const beforeMetadata = await snapshot(dataRoot);
  const first = await haldurDesignSkillService.getSnapshot();
  const afterMetadata = await snapshot(dataRoot);
  assert.equal(first.rootAvailable, true);
  assert.ok(first.revision);
  assert.deepEqual(afterMetadata, beforeMetadata, "read-only scan must not modify metadata");
  assert.ok(first.manifest.some((entry) => entry.relativePath === "SKILL.md" && entry.type === "file"));
  assert.ok(first.manifest.some((entry) => entry.relativePath === "微规范/表单/校验.md" && entry.checksum));
  assert.equal(findNode(first.nodes, "微规范/表单/校验.md")?.metadata?.description, "表单校验规则");
  assert.ok(first.diagnostics.some((diagnostic) => diagnostic.code === "unsafe-entry" && diagnostic.relativePath === "outside-link"));

  await writeFile(path.join(skillRoot, "微规范", "表单", "校验.md"), "changed\n");
  const second = await haldurDesignSkillService.getSnapshot();
  assert.notEqual(second.revision, first.revision, "file changes must produce a new Root revision");

  assert.equal(normalizeHaldurRelativePath("微规范/表单/校验.md"), "微规范/表单/校验.md");
  assert.equal(normalizeHaldurRelativePath("", { allowRoot: true }), "");
  for (const value of ["../escape", "/tmp/escape", "C:/escape", "\\\\server\\share", "a%2Fb", "CON.md", "file. ", "a\\b", "a//b"]) {
    assert.throws(() => normalizeHaldurRelativePath(value), HaldurDesignSkillPathError);
  }

  console.log("[haldur] root config, readonly scan, metadata projection, manifest revision, Unicode, and path-safety verification passed.");
  } finally {
    await Promise.all([
      rm(dataRoot, { recursive: true, force: true }),
      outsideRoot ? rm(outsideRoot, { recursive: true, force: true }) : Promise.resolve()
    ]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
