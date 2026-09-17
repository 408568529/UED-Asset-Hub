import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ued-haldur-markdown-"));
  const skillRoot = path.join(dataRoot, "haldur-design-skill");
  const runtimeRoot = path.join(dataRoot, "haldur-design-skill-runtime");
  process.env.DATA_DIR = dataRoot;
  process.env.HALDUR_DESIGN_SKILL_ROOT = skillRoot;
  process.env.HALDUR_DESIGN_SKILL_RUNTIME_ROOT = runtimeRoot;
  process.env.HALDUR_DESIGN_SKILL_MAX_MARKDOWN_BYTES = "1024";

  try {
    const { HaldurDirectoryOperationError } = await import("@/services/haldurDesignSkillDirectoryService");
    const { haldurDesignSkillFileService } = await import("@/services/haldurDesignSkillFileService");
    const { haldurDesignSkillService } = await import("@/services/haldurDesignSkillService");
    await mkdir(path.join(skillRoot, "references", "future-folder"), { recursive: true });
    await mkdir(path.join(dataRoot, "meta"), { recursive: true });
    await writeFile(path.join(skillRoot, "SKILL.md"), Buffer.from("\ufeff# Haldur\n\n你好\n", "utf8"));
    await writeFile(path.join(skillRoot, "references", "future-folder", "guide.MD"), "# Guide\n");
    await writeFile(path.join(skillRoot, "plain.txt"), "not markdown");
    await writeFile(path.join(dataRoot, "meta", "haldur-design-skill.json"), JSON.stringify({ schemaVersion: 1, entries: { "SKILL.md": { description: "keep", tags: ["entry"] } } }));

    const initial = await haldurDesignSkillFileService.readMarkdown("SKILL.md");
    assert.equal(initial.content, "# Haldur\n\n你好\n", "UTF-8 BOM must be stripped");
    assert.equal((await haldurDesignSkillFileService.readMarkdown("references/future-folder/guide.MD")).content, "# Guide\n");
    await assert.rejects(haldurDesignSkillFileService.readMarkdown("plain.txt"), (error: unknown) => error instanceof HaldurDirectoryOperationError && error.code === "MARKDOWN_REQUIRED");
    await assert.rejects(haldurDesignSkillFileService.readMarkdown("../secret.md"), (error: unknown) => error instanceof HaldurDirectoryOperationError && error.code === "INVALID_PATH");

    const saved = await haldurDesignSkillFileService.saveMarkdown({ relativePath: "SKILL.md", content: "# Updated\n", revision: initial.revision, operator: "fixture-editor" });
    assert.equal(await readFile(path.join(skillRoot, "SKILL.md"), "utf8"), "# Updated\n");
    assert.notEqual(saved.snapshot.revision, initial.revision);
    const metadata = JSON.parse(await readFile(path.join(dataRoot, "meta", "haldur-design-skill.json"), "utf8"));
    assert.equal(metadata.entries["SKILL.md"].description, "keep");
    assert.deepEqual(metadata.entries["SKILL.md"].tags, ["entry"]);
    const journal = JSON.parse(await readFile(path.join(runtimeRoot, "journal", `${saved.operationId}.json`), "utf8"));
    assert.equal(journal.status, "committed");
    assert.ok((await readdir(path.join(runtimeRoot, "audit"))).length > 0);
    assert.equal((await readdir(path.join(runtimeRoot, "staging"))).length, 0);

    await assert.rejects(haldurDesignSkillFileService.saveMarkdown({ relativePath: "SKILL.md", content: "# Stale\n", revision: initial.revision, operator: "fixture-editor" }), (error: unknown) => error instanceof HaldurDirectoryOperationError && error.code === "REVISION_CONFLICT");
    await writeFile(path.join(runtimeRoot, "journal", "interrupted.json"), JSON.stringify({ status: "mutating", operationType: "overwrite-file" }));
    const current = await haldurDesignSkillService.getSnapshot();
    await assert.rejects(haldurDesignSkillFileService.saveMarkdown({ relativePath: "SKILL.md", content: "# Blocked\n", revision: current.revision!, operator: "fixture-editor" }), (error: unknown) => error instanceof HaldurDirectoryOperationError && error.code === "RECOVERY_REQUIRED");

    console.log("[haldur] Markdown read, UTF-8, nested paths, safety, overwrite transaction, metadata, revision, audit, staging cleanup, and recovery verification passed.");
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
