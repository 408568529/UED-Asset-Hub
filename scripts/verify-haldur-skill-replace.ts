import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
const base = await fs.mkdtemp(path.join(os.tmpdir(), "ued-complete-skill-"));
process.env.DATA_DIR = path.join(base, "data"); await fs.mkdir(process.env.DATA_DIR); await fs.mkdir(path.join(process.env.DATA_DIR, "meta"));
const { haldurDesignSkillService: snapshots } = await import("@/services/haldurDesignSkillService");
const { haldurDesignSkillReplaceService: replace } = await import("@/services/haldurDesignSkillReplaceService");
const { hasHaldurRecoveryRequired } = await import("@/services/haldurDesignSkillDirectoryService");
const { haldurDesignSkillFileService: files } = await import("@/services/haldurDesignSkillFileService");
const originalRename = fs.rename;
let serial = 0;
async function fixture() {
  const root = path.join(base, `root-${++serial}`), runtime = path.join(base, `runtime-${serial}`);
  await fs.mkdir(path.join(root, "old-folder"), { recursive: true }); await fs.mkdir(path.join(root, "type-change"));
  await fs.writeFile(path.join(root, "old.md"), "old payload"); await fs.writeFile(path.join(root, "old-folder", "keep.scss"), "$old: 1px;");
  process.env.HALDUR_DESIGN_SKILL_ROOT = root; process.env.HALDUR_DESIGN_SKILL_RUNTIME_ROOT = runtime;
  await fs.writeFile(path.join(process.env.DATA_DIR!, "meta", "haldur-design-skill.json"), JSON.stringify({ schemaVersion: 1, entries: { "old.md": { description: "old metadata" } } }));
  const before = await snapshots.getSnapshot(); return { root, runtime, before, inode: (await fs.stat(root)).ino };
}
async function staged(revision: string) {
  const plan = await replace.prepare({ revision, files: [{ relativePath: "new.md", size: 3 }, { relativePath: "type-change", size: 1 }, { relativePath: "empty.md", size: 0 }], directories: ["empty-dir"] });
  await replace.upload(plan.id, 0, (async function* () { yield Buffer.from("new"); })());
  await replace.upload(plan.id, 1, (async function* () { yield Buffer.from("x"); })());
  await replace.upload(plan.id, 2, (async function* () { yield Buffer.alloc(0); })()); return plan;
}
try {
  const good = await fixture(); const plan = await staged(good.before.revision!);
  assert.equal(await fs.readFile(path.join(good.root, "old.md"), "utf8"), "old payload", "staging must not modify live data");
  const committed = await replace.commit(plan.id, good.before.revision!, "test");
  assert.deepEqual(committed.snapshot.manifest.map(e => e.relativePath).sort(), ["empty-dir", "empty.md", "new.md", "type-change"]);
  assert.equal((await fs.stat(good.root)).ino, good.inode, "Root and its ACL must remain in place");
  assert.equal(await fs.readFile(path.join(good.runtime, "trash", committed.operationId, "content", "old.md"), "utf8"), "old payload");
  assert.equal(await fs.readFile(path.join(good.runtime, "trash", committed.operationId, "content", "old-folder", "keep.scss"), "utf8"), "$old: 1px;");
  assert.ok(JSON.parse(await fs.readFile(path.join(good.runtime, "trash", committed.operationId, "metadata.before.json"), "utf8")).entries["old.md"]);
  assert.equal(JSON.parse(await fs.readFile(path.join(process.env.DATA_DIR!, "meta", "haldur-design-skill.json"), "utf8")).entries["old.md"], undefined);
  assert.equal((await replace.status(plan.id)).status, "committed");
  await assert.rejects(replace.commit(plan.id, good.before.revision!, "test"), /已提交/);
  const bad = await fixture();
  for (const invalid of [[], [{ relativePath: "../secret", size: 1 }], [{ relativePath: "A.md", size: 1 }, { relativePath: "a.md", size: 1 }], [{ relativePath: "a", size: 1 }, { relativePath: "a/b", size: 1 }]]) await assert.rejects(replace.prepare({ revision: bad.before.revision!, files: invalid }));
  const missing = await replace.prepare({ revision: bad.before.revision!, files: [{ relativePath: "new.md", size: 4 }] });
  await assert.rejects(replace.commit(missing.id, bad.before.revision!, "test"));
  assert.equal((await snapshots.getSnapshot()).revision, bad.before.revision);
  await assert.rejects(replace.upload(missing.id, 0, (async function* () { yield Buffer.from("short"); })()));
  assert.equal((await snapshots.getSnapshot()).revision, bad.before.revision);
  const stale = await fixture(); const stalePlan = await staged(stale.before.revision!);
  await fs.writeFile(path.join(stale.root, "old.md"), "changed by another operation");
  await assert.rejects(replace.commit(stalePlan.id, stale.before.revision!, "test"), { code: "REVISION_CONFLICT" });
  assert.equal(await fs.readFile(path.join(stale.root, "old.md"), "utf8"), "changed by another operation");
  const rollback = await fixture(); const rollbackPlan = await staged(rollback.before.revision!);
  let injected = false;
  fs.rename = (async (from, to) => { if (!injected && String(from).includes(path.join("tree", "new.md")) && String(to) === path.join(rollback.root, "new.md")) { injected = true; throw new Error("injected commit failure"); } return originalRename(from, to); }) as typeof fs.rename;
  await assert.rejects(replace.commit(rollbackPlan.id, rollback.before.revision!, "test")); fs.rename = originalRename;
  assert.ok(injected); assert.equal((await snapshots.getSnapshot()).revision, rollback.before.revision); assert.equal(await hasHaldurRecoveryRequired(rollback.runtime), false); assert.equal((await replace.status(rollbackPlan.id)).status, "rolled-back");
  const metadataFailure = await fixture(); const metadataPlan = await staged(metadataFailure.before.revision!);
  fs.rename = (async (from, to) => { if (String(to) === path.join(process.env.DATA_DIR!, "meta", "haldur-design-skill.json")) throw new Error("injected metadata failure"); return originalRename(from, to); }) as typeof fs.rename;
  await assert.rejects(replace.commit(metadataPlan.id, metadataFailure.before.revision!, "test")); fs.rename = originalRename;
  assert.equal((await snapshots.getSnapshot()).revision, metadataFailure.before.revision);
  assert.ok(JSON.parse(await fs.readFile(path.join(process.env.DATA_DIR!, "meta", "haldur-design-skill.json"), "utf8")).entries["old.md"]);
  const frozen = await fixture(); const frozenPlan = await staged(frozen.before.revision!);
  fs.rename = (async (from, to) => { if (String(from).includes(path.join("tree", "new.md")) || String(from).includes(path.join("trash")) && String(to).startsWith(frozen.root + path.sep)) throw new Error("injected unrecoverable move"); return originalRename(from, to); }) as typeof fs.rename;
  await assert.rejects(replace.commit(frozenPlan.id, frozen.before.revision!, "test"), /回滚/); fs.rename = originalRename;
  assert.equal(await hasHaldurRecoveryRequired(frozen.runtime), true);
  await assert.rejects(replace.prepare({ revision: frozen.before.revision!, files: [{ relativePath: "a.md", size: 1 }] }), /恢复/);
  const concurrent = await fixture(); const concurrentPlan = await staged(concurrent.before.revision!);
  const results = await Promise.allSettled([replace.commit(concurrentPlan.id, concurrent.before.revision!, "test"), files.upload({ targetParentRelativePath: "", originalFileName: "other.md", revision: concurrent.before.revision!, overwrite: false, operator: "test", source: (async function* () { yield Buffer.from("other"); })() })]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1, "regular uploads and full replacement must share the same write lock and revision");
  console.log("PASS: exact final tree, empty directory, type changes, original trash, metadata backup, staged/missing/invalid payloads, stale revision, rollback, recovery freeze, concurrent mutation");
} finally { fs.rename = originalRename; await fs.rm(base, { recursive: true, force: true }); }

}
main().catch(error => { console.error(error); process.exitCode = 1; });
