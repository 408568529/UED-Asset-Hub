import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function payload(value: string) {
  return (async function* () { yield Buffer.from(value); })();
}

async function readDownload(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) return Buffer.concat(parts.map((value) => Buffer.from(value))).toString();
      parts.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
}

async function main() {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ued-haldur-file-data-"));
  const skillRoot = path.join(dataRoot, "haldur-design-skill");
  const runtimeRoot = path.join(dataRoot, "haldur-design-skill-runtime");
  process.env.DATA_DIR = dataRoot;
  process.env.HALDUR_DESIGN_SKILL_ROOT = skillRoot;
  process.env.HALDUR_DESIGN_SKILL_RUNTIME_ROOT = runtimeRoot;
  process.env.HALDUR_DESIGN_SKILL_MAX_UPLOAD_BYTES = "1048576";

  try {
    const { HaldurDirectoryOperationError, haldurDesignSkillDirectoryService } = await import("@/services/haldurDesignSkillDirectoryService");
    const { haldurDesignSkillFileService } = await import("@/services/haldurDesignSkillFileService");
    const { haldurDesignSkillService } = await import("@/services/haldurDesignSkillService");
    await mkdir(path.join(skillRoot, "source"), { recursive: true });
    await mkdir(path.join(skillRoot, "target"), { recursive: true });
    await mkdir(path.join(dataRoot, "meta"), { recursive: true });
    await writeFile(path.join(skillRoot, "SKILL.md"), "# Haldur\n");

    const initial = await haldurDesignSkillService.getSnapshot();
    const uploaded = await haldurDesignSkillFileService.upload({ targetParentRelativePath: "source", originalFileName: "a.md", revision: initial.revision!, overwrite: false, source: payload("first payload"), mime: "text/markdown", operator: "fixture-admin" });
    assert.ok(uploaded.snapshot.manifest.some((entry) => entry.relativePath === "source/a.md" && entry.size === 13));
    const metadataPath = path.join(dataRoot, "meta", "haldur-design-skill.json");
    const firstMetadata = JSON.parse(await readFile(metadataPath, "utf8"));
    assert.equal(firstMetadata.entries["source/a.md"].size, 13);
    assert.ok(firstMetadata.entries["source/a.md"].hash);
    assert.equal((await readdir(path.join(runtimeRoot, "staging"))).length, 0, "successful upload must clean staging");

    await assert.rejects(
      haldurDesignSkillFileService.upload({ targetParentRelativePath: "source", originalFileName: "a.md", revision: uploaded.snapshot.revision!, overwrite: false, source: payload("conflict"), operator: "fixture-admin" }),
      (error: unknown) => error instanceof HaldurDirectoryOperationError && error.code === "NAME_CONFLICT"
    );
    assert.equal(await readFile(path.join(skillRoot, "source", "a.md"), "utf8"), "first payload");

    await writeFile(metadataPath, JSON.stringify({ schemaVersion: 1, entries: { "source/a.md": { description: "keep", tags: ["existing"] } } }));
    const beforeOverwrite = await haldurDesignSkillService.getSnapshot();
    const overwritten = await haldurDesignSkillFileService.upload({ targetParentRelativePath: "source", originalFileName: "a.md", revision: beforeOverwrite.revision!, overwrite: true, source: payload("replacement"), operator: "fixture-admin" });
    assert.equal(await readFile(path.join(skillRoot, "source", "a.md"), "utf8"), "replacement");
    const overwrittenMetadata = JSON.parse(await readFile(metadataPath, "utf8"));
    assert.equal(overwrittenMetadata.entries["source/a.md"].description, "keep");
    assert.deepEqual(overwrittenMetadata.entries["source/a.md"].tags, ["existing"]);
    assert.ok(!(await readdir(skillRoot)).some((name) => /\.bak$|\.tmp$/.test(name)), "Root must not contain transaction artifacts");

    const renamed = await haldurDesignSkillFileService.rename({ sourceRelativePath: "source/a.md", newFileName: "renamed.md", revision: overwritten.snapshot.revision!, operator: "fixture-admin" });
    assert.equal(await readFile(path.join(skillRoot, "source", "renamed.md"), "utf8"), "replacement");
    const afterRenameMetadata = JSON.parse(await readFile(metadataPath, "utf8"));
    assert.ok(afterRenameMetadata.entries["source/renamed.md"]);
    assert.ok(!afterRenameMetadata.entries["source/a.md"]);

    const moved = await haldurDesignSkillFileService.move({ sourceRelativePath: "source/renamed.md", targetParentRelativePath: "target", revision: renamed.snapshot.revision!, operator: "fixture-admin" });
    assert.equal(await readFile(path.join(skillRoot, "target", "renamed.md"), "utf8"), "replacement");
    const download = await haldurDesignSkillFileService.download("target/renamed.md");
    assert.equal(await readDownload(download.stream), "replacement");
    await assert.rejects(haldurDesignSkillFileService.download("../secret"), (error: unknown) => error instanceof HaldurDirectoryOperationError && error.code === "INVALID_PATH");

    const deleted = await haldurDesignSkillFileService.delete({ sourceRelativePath: "target/renamed.md", revision: moved.snapshot.revision!, operator: "fixture-admin" });
    assert.ok(!deleted.snapshot.manifest.some((entry) => entry.relativePath === "target/renamed.md"));
    assert.equal(await readFile(path.join(runtimeRoot, "trash", deleted.operationId, "renamed.md"), "utf8"), "replacement");

    const beforeMetadataFailure = await haldurDesignSkillService.getSnapshot();
    await writeFile(metadataPath, JSON.stringify({ schemaVersion: 99, entries: {} }));
    await assert.rejects(
      haldurDesignSkillFileService.upload({ targetParentRelativePath: "source", originalFileName: "metadata-failure.md", revision: beforeMetadataFailure.revision!, overwrite: false, source: payload("must rollback"), operator: "fixture-admin" }),
      (error: unknown) => error instanceof HaldurDirectoryOperationError && error.code === "METADATA_FAILED"
    );
    await assert.rejects(readFile(path.join(skillRoot, "source", "metadata-failure.md")), { code: "ENOENT" });
    await writeFile(metadataPath, JSON.stringify({ schemaVersion: 1, entries: {} }));

    const beforeTooLarge = await haldurDesignSkillService.getSnapshot();
    process.env.HALDUR_DESIGN_SKILL_MAX_UPLOAD_BYTES = "3";
    await assert.rejects(
      haldurDesignSkillFileService.upload({ targetParentRelativePath: "source", originalFileName: "large.bin", revision: beforeTooLarge.revision!, overwrite: false, source: payload("too large"), operator: "fixture-admin" }),
      (error: unknown) => error instanceof HaldurDirectoryOperationError && error.code === "FILE_TOO_LARGE"
    );
    assert.ok(!((await haldurDesignSkillService.getSnapshot()).manifest.some((entry) => entry.relativePath === "source/large.bin")));
    process.env.HALDUR_DESIGN_SKILL_MAX_UPLOAD_BYTES = "1048576";

    const beforeDiskFailure = await haldurDesignSkillService.getSnapshot();
    process.env.HALDUR_DESIGN_SKILL_MIN_FREE_BYTES = String(Number.MAX_SAFE_INTEGER);
    await assert.rejects(
      haldurDesignSkillFileService.upload({ targetParentRelativePath: "source", originalFileName: "disk.bin", revision: beforeDiskFailure.revision!, overwrite: false, source: payload("disk check"), operator: "fixture-admin" }),
      (error: unknown) => error instanceof HaldurDirectoryOperationError && error.code === "DISK_SPACE_INSUFFICIENT"
    );
    delete process.env.HALDUR_DESIGN_SKILL_MIN_FREE_BYTES;

    const beforeConcurrent = await haldurDesignSkillService.getSnapshot();
    const concurrent = await Promise.allSettled([
      haldurDesignSkillFileService.upload({ targetParentRelativePath: "source", originalFileName: "concurrent.md", revision: beforeConcurrent.revision!, overwrite: false, source: payload("file"), operator: "fixture-admin" }),
      haldurDesignSkillDirectoryService.createDirectory({ parentRelativePath: "", directoryName: "concurrent-directory", revision: beforeConcurrent.revision!, operator: "fixture-admin" })
    ]);
    assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1, "file and directory mutations must share one Root lock");
    assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1);

    const journals = await readdir(path.join(runtimeRoot, "journal"));
    for (const name of journals) {
      const journal = JSON.parse(await readFile(path.join(runtimeRoot, "journal", name), "utf8"));
      assert.ok(["committed", "rolled-back"].includes(journal.status));
    }
    await writeFile(path.join(runtimeRoot, "journal", "interrupted-overwrite.json"), JSON.stringify({ status: "mutating", operationType: "overwrite-file", backupPath: "runtime-only" }));
    const finalSnapshot = await haldurDesignSkillService.getSnapshot();
    await assert.rejects(
      haldurDesignSkillFileService.upload({ targetParentRelativePath: "source", originalFileName: "blocked.md", revision: finalSnapshot.revision!, overwrite: false, source: payload("blocked"), operator: "fixture-admin" }),
      (error: unknown) => error instanceof HaldurDirectoryOperationError && error.code === "RECOVERY_REQUIRED"
    );

    console.log("[haldur] file upload, explicit overwrite, rename, move, trash, download, metadata rollback, limits, disk guard, shared lock, and recovery verification passed.");
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
