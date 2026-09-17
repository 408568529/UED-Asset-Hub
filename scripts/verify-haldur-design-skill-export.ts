import assert from "node:assert/strict";
import { createWriteStream } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import yauzl, { type Entry, type ZipFile } from "yauzl";

function zipEntryPath(name: string) {
  if (!name || name.startsWith("/") || name.startsWith("\\\\") || /^[A-Za-z]:[\\/]/.test(name)) throw new Error("ZIP entry path is absolute.");
  const normalized = name.replaceAll("\\", "/");
  if (normalized.split("/").some((segment) => segment === "..")) throw new Error("ZIP entry path escapes extraction root.");
  return normalized;
}

function openZip(file: string) {
  return new Promise<ZipFile>((resolve, reject) => yauzl.open(file, { lazyEntries: true, autoClose: false, validateEntrySizes: true }, (error, zip) => error ? reject(error) : resolve(zip)));
}

function openZipEntry(zip: ZipFile, entry: Entry) {
  return new Promise<NodeJS.ReadableStream>((resolve, reject) => zip.openReadStream(entry, (error, stream) => error ? reject(error) : resolve(stream)));
}

async function inspectAndExtractZip(file: string, output: string) {
  const zip = await openZip(file);
  const entries: string[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      zip.once("error", reject);
      zip.once("end", resolve);
      zip.on("entry", async (entry: Entry) => {
        try {
          const name = zipEntryPath(entry.fileName);
          const mode = entry.externalFileAttributes >>> 16;
          if ((mode & 0o170000) === 0o120000) throw new Error("ZIP symlink entries are forbidden.");
          const destination = path.resolve(output, ...name.split("/").filter(Boolean));
          if (destination !== output && !destination.startsWith(`${output}${path.sep}`)) throw new Error("ZIP entry resolved outside extraction root.");
          entries.push(name);
          if (name.endsWith("/")) await mkdir(destination, { recursive: true });
          else {
            await mkdir(path.dirname(destination), { recursive: true });
            await pipeline(await openZipEntry(zip, entry), createWriteStream(destination, { flags: "wx" }));
          }
          zip.readEntry();
        } catch (error) { zip.close(); reject(error); }
      });
      zip.readEntry();
    });
    return entries;
  } finally { zip.close(); }
}

async function main() {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ued-haldur-export-data-"));
  const skillRoot = path.join(dataRoot, "haldur-design-skill");
  const runtimeRoot = path.join(dataRoot, "haldur-design-skill-runtime");
  process.env.DATA_DIR = dataRoot; process.env.HALDUR_DESIGN_SKILL_ROOT = skillRoot; process.env.HALDUR_DESIGN_SKILL_RUNTIME_ROOT = runtimeRoot;
  try {
    const { haldurDesignSkillExportService, HaldurSkillExportError } = await import("@/services/haldurDesignSkillExportService");
    const { haldurDesignSkillService } = await import("@/services/haldurDesignSkillService");
    await mkdir(path.join(skillRoot, "微规范", "空目录"), { recursive: true });
    await mkdir(path.join(skillRoot, "patterns"), { recursive: true });
    await mkdir(path.join(runtimeRoot, "trash"), { recursive: true });
    await writeFile(path.join(skillRoot, "SKILL.md"), "# Haldur\n");
    await writeFile(path.join(skillRoot, "微规范", "表单 校验.md"), "unicode payload");
    await writeFile(path.join(runtimeRoot, "trash", "never.zip"), "runtime must never enter export");
    const before = await haldurDesignSkillService.getSnapshot();
    const exported = await haldurDesignSkillExportService.create();
    assert.equal(exported.revision, before.revision);
    assert.ok((await stat(exported.zipPath)).size > 0);
    const extractRoot = await mkdtemp(path.join(os.tmpdir(), "ued-haldur-export-extract-"));
    const entries = await inspectAndExtractZip(exported.zipPath, extractRoot);
    assert.ok(entries.includes("Haldur-Design-Skill/"));
    assert.ok(entries.includes("Haldur-Design-Skill/SKILL.md"));
    assert.ok(entries.includes("Haldur-Design-Skill/微规范/表单 校验.md"));
    assert.ok(entries.includes("Haldur-Design-Skill/微规范/空目录/"));
    assert.ok(entries.includes("Haldur-Design-Skill/patterns/"));
    assert.ok(!entries.some((entry) => entry.includes("runtime") || entry.includes("trash") || entry.startsWith("/") || entry.includes("..")));
    assert.equal(await readFile(path.join(extractRoot, "Haldur-Design-Skill", "微规范", "表单 校验.md"), "utf8"), await readFile(path.join(skillRoot, "微规范", "表单 校验.md"), "utf8"));
    assert.throws(() => zipEntryPath("../escape.md"), /escapes extraction root/);
    assert.throws(() => zipEntryPath("C:\\escape.md"), /absolute/);
    assert.throws(() => zipEntryPath("\\\\server\\share\\escape.md"), /absolute/);
    await rm(extractRoot, { recursive: true, force: true });
    await exported.cleanup();
    await assert.rejects(stat(exported.zipPath), { code: "ENOENT" });

    let changes = 0;
    const retried = await haldurDesignSkillExportService.create({ afterPackaged: async (attempt: number) => { if (attempt === 0) { changes += 1; await writeFile(path.join(skillRoot, "patterns", "retry.md"), "retry"); } } });
    assert.equal(changes, 1, "first snapshot conflict must retry once");
    await retried.cleanup();
    await assert.rejects(
      haldurDesignSkillExportService.create({ afterPackaged: async () => { await writeFile(path.join(skillRoot, "patterns", "continuous.md"), String(Date.now())); } }),
      (error: unknown) => error instanceof HaldurSkillExportError && error.code === "SNAPSHOT_CONFLICT"
    );

    process.env.HALDUR_DESIGN_SKILL_EXPORT_MIN_FREE_BYTES = String(Number.MAX_SAFE_INTEGER);
    await assert.rejects(haldurDesignSkillExportService.create(), (error: unknown) => error instanceof HaldurSkillExportError && error.code === "EXPORT_DISK_SPACE_INSUFFICIENT");
    delete process.env.HALDUR_DESIGN_SKILL_EXPORT_MIN_FREE_BYTES;
    await mkdir(path.join(runtimeRoot, "journal"), { recursive: true });
    await writeFile(path.join(runtimeRoot, "journal", "interrupted.json"), JSON.stringify({ status: "mutating" }));
    await assert.rejects(haldurDesignSkillExportService.create(), (error: unknown) => error instanceof HaldurSkillExportError && error.code === "RECOVERY_REQUIRED");
    console.log("[haldur] whole-skill ZIP top-level, dynamic directories, empty directories, Unicode, revision, runtime exclusion, cleanup, disk guard, and recovery verification passed.");
  } finally { await rm(dataRoot, { recursive: true, force: true }); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
