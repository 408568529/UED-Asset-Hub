import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
async function main() {
const temp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "ued-html-template-")));
const root = path.join(temp, "skill");
process.env.HALDUR_DESIGN_SKILL_ROOT = root;
process.env.HALDUR_DESIGN_SKILL_RUNTIME_ROOT = path.join(temp, "runtime-not-created");
process.env.DATA_DIR = path.join(temp, "data-not-created");
process.env.AGENT_GATEWAY_TOKEN = "synthetic-html-copy-only";
const entry = "2、典型页面/列表页-preview.html";
const theme = "5、基础样式/theme/index.css";
const cdn = "https://at.alicdn.com/t/c/font_123_fixture.js";
const body = `<!doctype html><html><head><link rel="stylesheet" href="../5、基础样式/theme/index.css"><script src="${cdn}"></script></head><body>Fixture</body></html>`;
const originalFetch = globalThis.fetch;
try {
  await fs.mkdir(path.dirname(path.join(root, entry)), { recursive: true });
  await fs.mkdir(path.dirname(path.join(root, theme)), { recursive: true });
  await fs.writeFile(path.join(root, entry), body);
  await fs.writeFile(path.join(root, theme), "h1{color:green}");
  globalThis.fetch = async input => { assert.equal(String(input), cdn); return new Response("/* synthetic iconfont */", { status: 200 }); };
  const { getListPageTemplateBundle } = await import("@/services/htmlTemplateBundleService");
  const { GET } = await import("@/app/api/knowledge-gateway/html-template/list-page/route");
  const before = await fs.readFile(path.join(root, entry));
  const bundle = await getListPageTemplateBundle();
  assert.equal(bundle.templateId, "list-page"); assert.equal(bundle.entry, entry); assert.equal(bundle.files.length, 3);
  assert.equal(bundle.sourceEntrySha256, createHash("sha256").update(before).digest("hex"));
  const copied = Buffer.from(bundle.files.find(file => file.path === entry)!.content, "base64").toString("utf8");
  assert.ok(copied.includes('../5、基础样式/theme/index.css')); assert.ok(copied.includes('../__resources/font_123_fixture.js')); assert.equal(copied.includes(cdn), false);
  for (const file of bundle.files) assert.equal(createHash("sha256").update(Buffer.from(file.content, "base64")).digest("hex"), file.sha256);
  assert.deepEqual(await fs.readFile(path.join(root, entry)), before);
  assert.equal((await GET(new Request("http://localhost/copy"))).status, 401);
  const response = await GET(new Request("http://localhost/copy", { headers: { Authorization: "Bearer synthetic-html-copy-only" } }));
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(JSON.stringify(await response.json()).includes(temp), false);
  await fs.writeFile(path.join(root, entry), body.replace(cdn, "https://example.com/evil.js")); await assert.rejects(getListPageTemplateBundle());
  await fs.writeFile(path.join(root, entry), body.replace('../5、基础样式/theme/index.css', '../../../../outside.css')); await assert.rejects(getListPageTemplateBundle());
  await fs.writeFile(path.join(root, entry), body); await fs.rename(path.join(root, theme), path.join(temp, "theme.css")); await fs.symlink(path.join(temp, "theme.css"), path.join(root, theme)); await assert.rejects(getListPageTemplateBundle()); await fs.unlink(path.join(root, theme)); await fs.copyFile(path.join(temp, "theme.css"), path.join(root, theme));
  globalThis.fetch = async () => { await fs.writeFile(path.join(root, theme), "h1{color:changed}"); return new Response("/* icon */"); };
  await assert.rejects(getListPageTemplateBundle());
  assert.equal(await fs.stat(process.env.DATA_DIR).then(() => true, () => false), false);
  assert.equal(await fs.stat(process.env.HALDUR_DESIGN_SKILL_RUNTIME_ROOT).then(() => true, () => false), false);
  console.log(JSON.stringify({ result: "PASS_HTML_TEMPLATE_BUNDLE", checks: ["source hashes and copied resources", "relative CSS and mirrored iconfont", "no Skill writes", "gateway auth", "no source-root leakage", "outside/external/symlink rejection", "revision consistency", "no data initialization"] }));
} finally { globalThis.fetch = originalFetch; await fs.rm(temp, { recursive: true, force: true }); }

}
main().catch(error => { console.error(error); process.exitCode = 1; });
