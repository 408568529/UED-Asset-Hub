import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { archiveMembers, materializeArchive, validateArchiveMemberPath, validateSourceSnapshotManifest } from "./windows-release-constructor.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const canonicalFilesystemRelativePath = (relativePath) => validateArchiveMemberPath(relativePath.replaceAll("\\", "/"));
const fixtures = ["ascii.txt", "中文/文件.txt", "日本語/資料.txt", "café.txt", "e\u0301.txt", "docs/Windows主机发布更新流程.html", "docs/Windows主机发布更新流程.md", "scripts/启动 UED Asset Hub Host Runner.bat", "scripts/启动 UED Asset Hub.bat"];
const block = (value, length) => { const result = Buffer.alloc(length); Buffer.from(value, "utf8").copy(result); return result; };
function archive(entries) {
  const blocks = [];
  for (const { name, body = Buffer.from(""), type = "0" } of entries) {
    const header = Buffer.alloc(512);
    block(name, 100).copy(header, 0); block("0000644\0", 8).copy(header, 100); block(`${body.length.toString(8).padStart(11, "0")}\0`, 12).copy(header, 124); header[156] = type.charCodeAt(0); block("ustar\0", 6).copy(header, 257); block("00", 2).copy(header, 263);
    blocks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}
const root = await mkdtemp(path.join(os.tmpdir(), "ued-g024-"));
try {
  const input = path.join(root, "fixture.tar"); const source = path.join(root, "source"); const workspace = path.join(root, "workspace");
  const entries = fixtures.map((name) => ({ name, body: Buffer.from(`payload:${name}`, "utf8") })); await writeFile(input, archive(entries));
  await materializeArchive({ archive: input, sourceRoot: source, workspace });
  assert.deepEqual(await archiveMembers(input), [...fixtures].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
  for (const name of fixtures) { const absolute = path.join(source, ...name.split("/")); assert.equal((await readFile(absolute, "utf8")), `payload:${name}`); assert.deepEqual([...canonicalFilesystemRelativePath(path.relative(source, absolute))], [...name]); }
  for (const name of fixtures) assert.equal(canonicalFilesystemRelativePath(name.replaceAll("/", "\\")), name);
  for (const unsafe of ["..\\escape", "foo\\..\\escape", "C:\\escape", "\\\\server\\share", "\\\\?\\device", "CON\\file", "trailing.\\file"]) assert.throws(() => canonicalFilesystemRelativePath(unsafe));
  for (const bad of ["/absolute", "C:/drive", "//server/share", "../escape", "CON/file", "trailing./file", "bad\\slash", "duplicate.txt"]) {
    const target = path.join(root, `${sha(bad)}.tar`); const items = bad === "duplicate.txt" ? [{ name: bad }, { name: bad }] : [{ name: bad }]; await writeFile(target, archive(items)); await assert.rejects(materializeArchive({ archive: target, sourceRoot: path.join(root, `${sha(bad)}-source`), workspace: path.join(root, `${sha(bad)}-workspace`) }));
  }
  const invalid = Buffer.alloc(512); Buffer.from([0xff, 0]).copy(invalid, 0); Buffer.from("00000000000\0").copy(invalid, 124); invalid[156] = 48; await writeFile(path.join(root, "invalid.tar"), Buffer.concat([invalid, Buffer.alloc(1024)])); await assert.rejects(archiveMembers(path.join(root, "invalid.tar")));
  const link = path.join(root, "link.tar"); await writeFile(link, archive([{ name: "link", type: "2" }])); await assert.rejects(materializeArchive({ archive: link, sourceRoot: path.join(root, "link-source"), workspace: path.join(root, "link-workspace") }));
  const conflict = path.join(root, "conflict"); await mkdir(conflict); await writeFile(path.join(conflict, "ascii.txt"), "old"); await assert.rejects(materializeArchive({ archive: input, sourceRoot: conflict, workspace: path.join(root, "conflict-workspace") }));
  const reparse = path.join(root, "reparse"); const outside = path.join(root, "outside"); await mkdir(reparse); await mkdir(outside); await symlink(outside, path.join(reparse, "link"), "dir"); const escaped = path.join(root, "escaped.tar"); await writeFile(escaped, archive([{ name: "link/escape.txt" }])); await assert.rejects(materializeArchive({ archive: escaped, sourceRoot: reparse, workspace: path.join(root, "reparse-workspace") }));
  if (process.argv[2] && process.argv[3]) {
    const [archivePath, manifestPath] = process.argv.slice(2); const manifest = JSON.parse(await readFile(manifestPath, "utf8")); const actualSource = path.join(root, "actual-source"); const actualWorkspace = path.join(root, "actual-workspace"); const extracted = await materializeArchive({ archive: archivePath, sourceRoot: actualSource, workspace: actualWorkspace });
    await validateSourceSnapshotManifest({ "source-classification": manifest.sourceClassification, "source-snapshot-manifest": manifestPath, "source-snapshot-manifest-sha256": sha(await readFile(manifestPath)), "source-commit": manifest.sourceCommit, "source-archive-sha256": manifest.sourceArchiveSha256, "creation-run-id": manifest.creationRunId }, extracted);
    for (const member of fixtures.slice(-4)) assert.equal(sha(await readFile(path.join(actualSource, ...member.split("/")))), manifest.files.find((file) => file.relativePath === member).sha256);
  }
  console.log(JSON.stringify({ result: "PASS", systemTarMaterializationAuthority: false, fixtureCount: fixtures.length, historicalUtf8Members: 4, unicode: ["ASCII", "中文", "日文", "accented Latin", "NFC-NFD exact"] }));
} finally { await rm(root, { recursive: true, force: true }); }
