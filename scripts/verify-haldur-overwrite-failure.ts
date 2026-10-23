import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
const base = await fs.mkdtemp(path.join(os.tmpdir(), "ued-overwrite-fault-"));
process.env.DATA_DIR = path.join(base, "data");
process.env.HALDUR_DESIGN_SKILL_ROOT = path.join(base, "skill");
process.env.HALDUR_DESIGN_SKILL_RUNTIME_ROOT = path.join(base, "runtime");
const originalRename = fs.rename;
try {
  await fs.mkdir(process.env.HALDUR_DESIGN_SKILL_ROOT, { recursive: true });
  await fs.mkdir(path.join(process.env.DATA_DIR, "meta"), { recursive: true });
  const target = path.join(process.env.HALDUR_DESIGN_SKILL_ROOT, "original.md");
  const { haldurDesignSkillFileService: files } = await import("@/services/haldurDesignSkillFileService");
  const { haldurDesignSkillService: tree } = await import("@/services/haldurDesignSkillService");
  for (const failRestore of [false, true]) {
    await fs.writeFile(target, "original bytes");
    const snapshot = await tree.getSnapshot();
    fs.rename = async (from, to) => {
      if (path.basename(String(from)) === "payload" || (failRestore && path.basename(String(from)) === "original-backup")) throw Object.assign(new Error("synthetic rename failure"), { code: "EIO" });
      return originalRename(from, to);
    };
    await assert.rejects(files.upload({ targetParentRelativePath: "", originalFileName: "original.md", revision: snapshot.revision!, overwrite: true, source: (async function* () { yield Buffer.from("new bytes"); })(), operator: "synthetic-fault-test" }), (error: unknown) => error instanceof Error && "code" in error && error.code === (failRestore ? "ROLLBACK_FAILED" : "REPLACE_FAILED"));
    fs.rename = originalRename;
    if (!failRestore) assert.equal(await fs.readFile(target, "utf8"), "original bytes", "failed replacement must restore the original bytes");
    else {
      const stage: string[] = await fs.readdir(path.join(process.env.HALDUR_DESIGN_SKILL_RUNTIME_ROOT, "staging"));
      assert.equal(stage.length, 1);
      assert.equal(await fs.readFile(path.join(process.env.HALDUR_DESIGN_SKILL_RUNTIME_ROOT, "staging", stage[0], "original-backup"), "utf8"), "original bytes");
      await assert.rejects(files.upload({ targetParentRelativePath: "", originalFileName: "blocked.md", revision: (await tree.getSnapshot()).revision!, overwrite: false, source: (async function* () { yield Buffer.from("blocked"); })(), operator: "synthetic-fault-test" }), (error: unknown) => error instanceof Error && "code" in error && error.code === "RECOVERY_REQUIRED");
    }
  }
  console.log("PASS: overwrite failure restores original; failed rollback retains backup and blocks writes");
} finally { fs.rename = originalRename; await fs.rm(base, { recursive: true, force: true }); }

}
main().catch(error => { console.error(error); process.exitCode = 1; });
