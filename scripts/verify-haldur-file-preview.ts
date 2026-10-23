import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { haldurUploadHeaders, decodeHaldurHeader } from "@/lib/haldur/uploadHeaders";
async function main() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "ued-preview-read-test-"));
  process.env.HALDUR_DESIGN_SKILL_ROOT = path.join(base, "skill");
  process.env.HALDUR_DESIGN_SKILL_RUNTIME_ROOT = path.join(base, "runtime");
  try {
    const root = process.env.HALDUR_DESIGN_SKILL_ROOT;
    await fs.mkdir(path.join(root, "中文目录", "assets"), { recursive: true });
    await fs.writeFile(path.join(root, "中文目录", "入口 (#1).html"), "<h1>真实 UTF-8</h1>");
    await fs.writeFile(path.join(root, "中文目录", "assets", "style.css"), "body{color:green}");
    await fs.writeFile(path.join(root, "中文目录", "assets", "app.js"), "document.title='test'");
    await fs.writeFile(path.join(root, "中文目录", "assets", "logo.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await fs.writeFile(path.join(root, "中文目录", ".env"), "not-a-real-credential");
    await fs.writeFile(path.join(root, "outside.css"), "outside");
    await fs.writeFile(path.join(root, "中文目录", "invalid.html"), Buffer.from([0xff, 0xfe, 0xff]));
    await fs.writeFile(path.join(root, "中文目录", "big.html"), Buffer.alloc(2 * 1024 * 1024 + 1));
    await fs.symlink(path.join(root, "中文目录", "assets"), path.join(root, "中文目录", "alias"));
    await fs.symlink(path.join(root, "中文目录", "入口 (#1).html"), path.join(root, "中文目录", "alias.html"));
    const { readHaldurPreview: read } = await import("@/services/haldurFilePreviewService");
    const entry = "中文目录/入口 (#1).html";
    assert.equal((await read(entry)).content, "<h1>真实 UTF-8</h1>");
    for (const file of ["style.css", "app.js", "logo.svg"]) assert.ok((await read(entry, `中文目录/assets/${file}`)).size > 0);
    for (const file of ["../secret", "/etc/passwd", "中文目录/../outside.css", "中文目录/%252e%252e/x.css", "中文目录/\\x.css", "中文目录/.env", "outside.css", "中文目录/alias/style.css", "中文目录/missing.css", "中文目录/assets/no.exe"])
      await assert.rejects(read(entry, file), file);
    for (const file of ["中文目录/alias.html", "中文目录/invalid.html", "中文目录/big.html"]) await assert.rejects(read(file), file);
    await assert.rejects(read("中文目录/missing.html", "中文目录/assets/style.css"));
    for (const name of ["中文 (#1).html", "a b.svg", "é.md"]) {
      const headers = haldurUploadHeaders("中文目录", name);
      assert.doesNotThrow(() => new Headers(headers));
      assert.equal(decodeHaldurHeader(headers["x-haldur-file-name"], "uri-v1"), name);
      assert.equal(decodeHaldurHeader(headers["x-haldur-parent-path"], "uri-v1"), "中文目录");
    }
    assert.equal(decodeHaldurHeader("legacy.md", null), "legacy.md");
    assert.throws(() => decodeHaldurHeader("%broken", "uri-v1"));
    assert.throws(() => decodeHaldurHeader("x", "unknown"));
    console.log("PASS: preview UTF-8, CSS/JS/SVG resources, directory scope, symlinks, traversal, missing/oversize/encoding, and upload header encoding");
  } finally { await fs.rm(base, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
