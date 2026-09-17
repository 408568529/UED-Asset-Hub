import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ued-haldur-directory-data-"));
  const skillRoot = path.join(dataRoot, "haldur-design-skill");
  const runtimeRoot = path.join(dataRoot, "haldur-design-skill-runtime");
  process.env.DATA_DIR = dataRoot;
  process.env.HALDUR_DESIGN_SKILL_ROOT = skillRoot;
  process.env.HALDUR_DESIGN_SKILL_RUNTIME_ROOT = runtimeRoot;

  try {
    const { HaldurDirectoryOperationError, haldurDesignSkillDirectoryService } = await import("@/services/haldurDesignSkillDirectoryService");
    const { haldurDesignSkillService } = await import("@/services/haldurDesignSkillService");
    await mkdir(path.join(skillRoot, "source", "child"), { recursive: true });
    await mkdir(path.join(dataRoot, "meta"), { recursive: true });
    await writeFile(path.join(skillRoot, "SKILL.md"), "# Haldur\n");
    await writeFile(path.join(dataRoot, "meta", "haldur-design-skill.json"), JSON.stringify({
      schemaVersion: 1,
      entries: { "source": { description: "source" }, "source/child": { tags: ["nested"] } }
    }, null, 2));

    const initial = await haldurDesignSkillService.getSnapshot();
    assert.ok(initial.revision);
    await assert.rejects(
      haldurDesignSkillDirectoryService.createDirectory({ parentRelativePath: "", directoryName: "CON", revision: initial.revision!, operator: "fixture-admin" }),
      (error: unknown) => error instanceof HaldurDirectoryOperationError && error.code === "INVALID_PATH"
    );
    assert.equal((await haldurDesignSkillService.getSnapshot()).revision, initial.revision, "invalid path must not mutate the Root");
    const concurrent = await Promise.allSettled([
      haldurDesignSkillDirectoryService.createDirectory({ parentRelativePath: "", directoryName: "queue-a", revision: initial.revision!, operator: "fixture-admin" }),
      haldurDesignSkillDirectoryService.createDirectory({ parentRelativePath: "", directoryName: "queue-b", revision: initial.revision!, operator: "fixture-admin" })
    ]);
    assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1, "Root lock must serialize concurrent writes");
    assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1, "second concurrent write must see a stale Revision");
    const afterConcurrent = await haldurDesignSkillService.getSnapshot();
    const created = await haldurDesignSkillDirectoryService.createDirectory({ parentRelativePath: "", directoryName: "created", revision: afterConcurrent.revision!, operator: "fixture-admin" });
    assert.notEqual(created.snapshot.revision, afterConcurrent.revision);
    assert.ok(created.snapshot.manifest.some((entry) => entry.relativePath === "created" && entry.type === "directory"));

    await assert.rejects(
      haldurDesignSkillDirectoryService.createDirectory({ parentRelativePath: "", directoryName: "stale", revision: initial.revision!, operator: "fixture-admin" }),
      (error: unknown) => error instanceof HaldurDirectoryOperationError && error.code === "REVISION_CONFLICT"
    );

    const renamed = await haldurDesignSkillDirectoryService.renameDirectory({ sourceRelativePath: "source", directoryName: "renamed", revision: created.snapshot.revision!, operator: "fixture-admin" });
    assert.ok(renamed.snapshot.manifest.some((entry) => entry.relativePath === "renamed/child"));
    assert.ok(!renamed.snapshot.manifest.some((entry) => entry.relativePath === "source"));
    const afterRenameMetadata = JSON.parse(await readFile(path.join(dataRoot, "meta", "haldur-design-skill.json"), "utf8"));
    assert.deepEqual(Object.keys(afterRenameMetadata.entries).sort(), ["renamed", "renamed/child"]);

    const moved = await haldurDesignSkillDirectoryService.moveDirectory({ sourceRelativePath: "renamed", targetParentRelativePath: "created", revision: renamed.snapshot.revision!, operator: "fixture-admin" });
    assert.ok(moved.snapshot.manifest.some((entry) => entry.relativePath === "created/renamed/child"));
    const afterMoveMetadata = JSON.parse(await readFile(path.join(dataRoot, "meta", "haldur-design-skill.json"), "utf8"));
    assert.deepEqual(Object.keys(afterMoveMetadata.entries).sort(), ["created/renamed", "created/renamed/child"]);

    await mkdir(path.join(skillRoot, "rollback-source"));
    const metadataPath = path.join(dataRoot, "meta", "haldur-design-skill.json");
    await writeFile(metadataPath, JSON.stringify({ schemaVersion: 1, entries: { ...afterMoveMetadata.entries, "rollback-source": { description: "rollback" } } }, null, 2));
    const beforeRollback = await haldurDesignSkillService.getSnapshot();
    await writeFile(metadataPath, JSON.stringify({ schemaVersion: 99, entries: {} }));
    await assert.rejects(
      haldurDesignSkillDirectoryService.renameDirectory({ sourceRelativePath: "rollback-source", directoryName: "rollback-target", revision: beforeRollback.revision!, operator: "fixture-admin" }),
      (error: unknown) => error instanceof HaldurDirectoryOperationError && error.code === "METADATA_FAILED"
    );
    assert.ok((await readdir(skillRoot)).includes("rollback-source"), "metadata failure must roll the directory back");
    assert.ok(!(await readdir(skillRoot)).includes("rollback-target"));
    await writeFile(metadataPath, JSON.stringify({ schemaVersion: 1, entries: afterMoveMetadata.entries }, null, 2));

    const beforeDelete = await haldurDesignSkillService.getSnapshot();
    const deleted = await haldurDesignSkillDirectoryService.deleteDirectory({ sourceRelativePath: "created/renamed", revision: beforeDelete.revision!, operator: "fixture-admin" });
    assert.ok(!deleted.snapshot.manifest.some((entry) => entry.relativePath === "created/renamed"));
    assert.ok((await readdir(path.join(runtimeRoot, "trash", deleted.operationId))).includes("renamed"));
    const afterDeleteMetadata = JSON.parse(await readFile(path.join(dataRoot, "meta", "haldur-design-skill.json"), "utf8"));
    assert.deepEqual(afterDeleteMetadata.entries, {});

    const journals = await readdir(path.join(runtimeRoot, "journal"));
    for (const journalName of journals) {
      const journal = JSON.parse(await readFile(path.join(runtimeRoot, "journal", journalName), "utf8"));
      assert.ok(["committed", "rolled-back"].includes(journal.status));
      assert.ok(journal.revisionBefore);
      if (journal.status === "committed") assert.ok(journal.revisionAfter);
      else assert.equal(journal.rollbackResult, "succeeded");
    }

    const beforeJournalFailure = await haldurDesignSkillService.getSnapshot();
    await rm(path.join(runtimeRoot, "journal"), { recursive: true });
    await writeFile(path.join(runtimeRoot, "journal"), "not-a-directory");
    await assert.rejects(
      haldurDesignSkillDirectoryService.createDirectory({ parentRelativePath: "", directoryName: "journal-failed", revision: beforeJournalFailure.revision!, operator: "fixture-admin" }),
      (error: unknown) => error instanceof HaldurDirectoryOperationError && error.code === "JOURNAL_FAILED"
    );
    assert.ok(!(await haldurDesignSkillService.getSnapshot()).manifest.some((entry) => entry.relativePath === "journal-failed"));
    await rm(path.join(runtimeRoot, "journal"));
    await mkdir(path.join(runtimeRoot, "journal"));
    await writeFile(path.join(runtimeRoot, "journal", "interrupted.json"), JSON.stringify({ status: "prepared" }));
    await assert.rejects(
      haldurDesignSkillDirectoryService.createDirectory({ parentRelativePath: "", directoryName: "blocked", revision: deleted.snapshot.revision!, operator: "fixture-admin" }),
      (error: unknown) => error instanceof HaldurDirectoryOperationError && error.code === "RECOVERY_REQUIRED"
    );
    assert.ok(!(await haldurDesignSkillService.getSnapshot()).manifest.some((entry) => entry.relativePath === "blocked"));

    console.log("[haldur] directory create, rename, move, delete-to-trash, metadata migration, revision conflict, journal, and recovery verification passed.");
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
