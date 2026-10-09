import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertJsonManifestPreserved, normalizeNextManifestBytes, normalizeNextManifestTree } from "./next-manifest-normalizer.mjs";

const corpusRoot = "/private/tmp/ued-g036b-run006-observer-closure-006";
const pair = JSON.parse(await readFile(path.join(corpusRoot, "pair-result.json"), "utf8"));
const captureA = JSON.parse(await readFile(path.join(corpusRoot, "capture-A.json"), "utf8"));
const captureB = JSON.parse(await readFile(path.join(corpusRoot, "capture-B.json"), "utf8"));
const entries = pair.files;
const counts = Object.fromEntries(["OBJECT_PROPERTY_ORDER_ONLY", "MIXED", "VALUE_DIVERGENCE", "EQUAL"].map((name) => [name, entries.filter((entry) => entry.classification === name).length]));
assert.deepEqual(counts, { OBJECT_PROPERTY_ORDER_ONLY: 126, MIXED: 1, VALUE_DIVERGENCE: 1, EQUAL: 1 });
assert.equal(entries.length, 129);
assert.equal(pair.experiment, "R3_MINIMUM_MANIFEST_FORENSICS_PAIR");
assert.equal(pair.authorities.a.sourceIdentity, pair.authorities.b.sourceIdentity);
assert.deepEqual(pair.capture, {
  ...pair.capture,
  aTargetCount: 129,
  bTargetCount: 129,
  pairedCount: 129,
  aOnlyPathCount: 0,
  bOnlyPathCount: 0,
});
assert.equal(captureA.label, "A");
assert.equal(captureB.label, "B");
assert.equal(captureA.targetCount, 129);
assert.equal(captureB.targetCount, 129);
assert.equal(captureA.missingPriorTargets.length + captureB.missingPriorTargets.length + captureA.addedTargets.length + captureB.addedTargets.length, 0);

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ued-next-manifest-normalizer-"));
const variants = new Map();
const suffix = ".next/standalone/.next/";
const assertBytesEqual = (left, right, message) => { if (!left.equals(right)) throw new Error(message); };
const assertBytesDifferent = (left, right, message) => { if (left.equals(right)) throw new Error(message); };
try {
  for (const label of ["A", "B"]) {
    const forensicRoot = path.join(corpusRoot, `forensics-${label}`);
    const isolatedRoot = path.join(tempRoot, label);
    const capture = label === "A" ? captureA : captureB;
    const evidenceByPath = new Map(capture.files.map((file) => [file.relativePath, file]));
    assert.equal(evidenceByPath.size, 129);
    const enumeratedPaths = [];
    const enumerate = async (directory, relative = "") => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await enumerate(path.join(directory, entry.name), childRelative);
        else if (entry.isFile()) enumeratedPaths.push(childRelative);
      }
    };
    await enumerate(forensicRoot);
    assert.deepEqual(enumeratedPaths.sort(), [...evidenceByPath.keys()].sort());
    for (const entry of entries) {
      assert.equal(entry.sizeA, entry.sizeB);
      assert.ok(entry.relativePath.startsWith(suffix));
      const relative = entry.relativePath.slice(suffix.length);
      const bytes = await readFile(path.join(forensicRoot, entry.relativePath));
      assert.equal(bytes.length, entry[`size${label}`]);
      const captureFile = evidenceByPath.get(entry.relativePath);
      assert.ok(captureFile);
      assert.equal(captureFile.size, bytes.length);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), captureFile.sha256);
      const destination = path.join(isolatedRoot, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
    }
    const changed = await normalizeNextManifestTree(isolatedRoot);
    variants.set(label, { root: isolatedRoot, changed });
  }

  const a = variants.get("A");
  const b = variants.get("B");
  let orderOnlyConverged = 0;
  let mixedStillDifferent = false;
  let securityDivergenceStillVisible = false;
  let equalRemainsEqual = false;
  for (const entry of entries) {
    const relative = entry.relativePath.slice(suffix.length);
    const normalizedA = await readFile(path.join(a.root, relative));
    const normalizedB = await readFile(path.join(b.root, relative));
    if (entry.classification === "OBJECT_PROPERTY_ORDER_ONLY") {
      assertBytesEqual(normalizedA, normalizedB, `order-only manifest did not converge: ${relative}`);
      orderOnlyConverged++;
    } else if (entry.classification === "MIXED") {
      assertBytesDifferent(normalizedA, normalizedB, "mixed manifest value divergence was hidden");
      assert.ok(a.changed.includes(relative) && b.changed.includes(relative), "prerender routes ordering was not normalized");
      mixedStillDifferent = true;
    } else if (entry.classification === "VALUE_DIVERGENCE") {
      assert.equal(normalizeNextManifestBytes(relative, await readFile(path.join(corpusRoot, "forensics-A", entry.relativePath))), null);
      assertBytesEqual(normalizedA, await readFile(path.join(corpusRoot, "forensics-A", entry.relativePath)), "security manifest was modified");
      assertBytesDifferent(normalizedA, normalizedB, "server-reference security value divergence was hidden");
      securityDivergenceStillVisible = true;
    } else {
      assertBytesEqual(normalizedA, normalizedB, "previously identical manifest changed");
      equalRemainsEqual = true;
    }
  }
  assert.equal(orderOnlyConverged, 126);
  assert.equal(mixedStillDifferent, true);
  assert.equal(securityDivergenceStillVisible, true);
  assert.equal(equalRemainsEqual, true);

  const json = (value) => Buffer.from(JSON.stringify(value), "utf8");
  const expectStop = (relative, bytes, pattern = /NEXT_MANIFEST_NORMALIZATION_STOP/u) => assert.throws(() => normalizeNextManifestBytes(relative, bytes), pattern);
  const baseline = { pages: { z: [1, 2], a: { nested: 1 } }, unrelated: { y: 2, x: 1 } };
  const normalized = normalizeNextManifestBytes("app-build-manifest.json", json(baseline));
  const normalizedValue = JSON.parse(normalized.toString("utf8"));
  assert.deepEqual(normalizedValue.pages.z, [1, 2]);
  assert.deepEqual(Object.keys(normalizedValue.pages), ["a", "z"]);
  assert.deepEqual(Object.keys(normalizedValue.unrelated), ["y", "x"]);

  const malformedCases = [
    ["app-build-manifest.json", Buffer.from('{"pages":{"a":1,"a":2}}')],
    ["app-build-manifest.json", Buffer.from('{"pages":{"a":1}')],
    ["app-build-manifest.json", json({ pages: [] })],
    ["app-path-routes-manifest.json", json([])],
    ["app-path-routes-manifest.json", Buffer.from([0xff, 0xfe])],
  ];
  for (const [relative, bytes] of malformedCases) expectStop(relative, bytes);
  const preservationInput = json({ pages: { z: [1, 2], a: { nested: 1 } }, unrelated: { a: 1, b: 2 } });
  const expectPreservationStop = (after) => assert.throws(() => assertJsonManifestPreserved("app-build-manifest.json", preservationInput, json(after)), /SEMANTIC_PRESERVATION_FAILED/u);
  expectPreservationStop({ pages: { a: { nested: 1 }, z: [1, 3] }, unrelated: { a: 1, b: 2 } });
  expectPreservationStop({ pages: { a: { nested: 1 }, added: true, z: [1, 2] }, unrelated: { a: 1, b: 2 } });
  expectPreservationStop({ pages: { a: { nested: 1 } }, unrelated: { a: 1, b: 2 } });
  expectPreservationStop({ pages: { a: { nested: 1 }, z: [2, 1] }, unrelated: { a: 1, b: 2 } });
  expectPreservationStop({ pages: { a: { nested: 2 }, z: [1, 2] }, unrelated: { a: 1, b: 2 } });
  assert.throws(() => assertJsonManifestPreserved("app-build-manifest.json", preservationInput, json({ pages: { a: { nested: 1 }, z: [1, 2] }, unrelated: { b: 2, a: 1 } })), /SEMANTIC_PRESERVATION_FAILED/u);

  const wrapper = (route, payload, suffixText = ";\n") => Buffer.from(`globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST[${JSON.stringify(route)}]=${JSON.stringify(payload)}${suffixText}`, "utf8");
  const clientA = wrapper("/test/page", { moduleLoading: { z: 1, a: 2 }, clientModules: { z: [1, 2], a: { nested: "v" } } });
  const clientB = wrapper("/test/page", { moduleLoading: { z: 1, a: 2 }, clientModules: { a: { nested: "v" }, z: [1, 2] } });
  assert.deepEqual(normalizeNextManifestBytes("server/app/test/page_client-reference-manifest.js", clientA), normalizeNextManifestBytes("server/app/test/page_client-reference-manifest.js", clientB));
  const unusualRoute = normalizeNextManifestBytes("server/app/test/page_client-reference-manifest.js", wrapper("/x]=y/page", { clientModules: { a: 1 } }));
  assert.ok(unusualRoute.toString("utf8").startsWith('globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST["/x]=y/page"]='));
  assert.throws(() => normalizeNextManifestBytes("server/app/test/page_client-reference-manifest.js", Buffer.from("globalThis.__RSC_MANIFEST=eval('bad')")), /MALFORMED_CLIENT_REFERENCE_WRAPPER/u);
  const duplicateClient = Buffer.from('globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST["/test/page"]={"clientModules":{"a":1,"\\u0061":2}};\n', "utf8");
  assert.throws(() => normalizeNextManifestBytes("server/app/test/page_client-reference-manifest.js", duplicateClient), /DUPLICATE_JSON_KEY/u);
  assert.throws(() => normalizeNextManifestBytes("server/app/test/page_client-reference-manifest.js", wrapper("/test/page", { clientModules: { a: 1 } }, ";globalThis.x=1")), /MALFORMED_CLIENT_REFERENCE_WRAPPER/u);

  const nestedA = normalizeNextManifestBytes("app-build-manifest.json", json({ pages: { only: 1 }, nested: { a: 1, b: 2 } }));
  const nestedB = normalizeNextManifestBytes("app-build-manifest.json", json({ pages: { only: 1 }, nested: { b: 2, a: 1 } }));
  assert.notDeepEqual(nestedA, nestedB, "unapproved nested order was hidden");
  const changedValueA = normalizeNextManifestBytes("app-path-routes-manifest.json", json({ route: "/a" }));
  const changedValueB = normalizeNextManifestBytes("app-path-routes-manifest.json", json({ route: "/b" }));
  assert.notDeepEqual(changedValueA, changedValueB, "object value divergence was hidden");
  const addedKey = normalizeNextManifestBytes("app-path-routes-manifest.json", json({ route: "/a", extra: true }));
  assert.notDeepEqual(changedValueA, addedKey, "added key divergence was hidden");
  const removedKey = normalizeNextManifestBytes("app-path-routes-manifest.json", json({}));
  assert.notDeepEqual(changedValueA, removedKey, "removed key divergence was hidden");
  const arrayOrderA = normalizeNextManifestBytes("prerender-manifest.json", json({ routes: { x: [1, 2] } }));
  const arrayOrderB = normalizeNextManifestBytes("prerender-manifest.json", json({ routes: { x: [2, 1] } }));
  assert.notDeepEqual(arrayOrderA, arrayOrderB, "array order divergence was hidden");
  const arrayValue = normalizeNextManifestBytes("prerender-manifest.json", json({ routes: { x: [1, 3] } }));
  assert.notDeepEqual(arrayOrderA, arrayValue, "array value divergence was hidden");
  assert.equal(normalizeNextManifestBytes("server/server-reference-manifest.json", json({ encryptionKey: "test" })), null);
  assert.equal(normalizeNextManifestBytes("unexpected/app-build-manifest.json", json({ pages: { a: 1 } })), null);

  process.stdout.write(`${JSON.stringify({ status: "PASS", corpusCount: entries.length, orderOnlyConverged, mixedValueDivergenceRetained: mixedStillDifferent, securityValueDivergenceRetained: securityDivergenceStillVisible, equalRemainsEqual, negativeTests: "PASS" })}\n`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
