import assert from "node:assert/strict";

const origin = "http://127.0.0.1:3047";
const listing = await fetch(`${origin}/api/haldur-design-skill`);
assert.equal(listing.status, 200, "Anonymous Skill listing must be readable");
assert.equal((await listing.json()).rootAvailable, true);
const document = await fetch(`${origin}/api/haldur-design-skill/files/content?path=SKILL.md`);
assert.equal(document.status, 200, "Anonymous Markdown must be readable");
assert.equal(typeof (await document.json()).content, "string");

for (const [method, route] of [
  ["POST", "/directories"], ["PATCH", "/directories"], ["DELETE", "/directories"],
  ["POST", "/files"], ["DELETE", "/files"], ["PUT", "/files/content"],
  ["GET", "/admin/audit"], ["GET", "/admin/runtime"]
]) {
  const response = await fetch(`${origin}/api/haldur-design-skill${route}`, { method });
  assert.equal(response.status, 403, `${method} ${route} requires an administrator session`);
}
console.log("PASS: anonymous Skill listing and Markdown work; all tested management routes reject anonymous requests. No asset mutations sent.");

for (const route of ["/download", "/files?path=SKILL.md"]) {
  const response = await fetch(`${origin}/api/haldur-design-skill${route}`);
  assert.equal(response.status, 200, `Anonymous ${route} download must work`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.ok(bytes.length > 0);
  if (route === "/download") assert.equal(Buffer.from(bytes).subarray(0, 2).toString(), "PK");
}
console.log("PASS: anonymous full ZIP and single-file download; no asset mutations.");
