import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { compareReleaseByteTrees } from "./release-byte-comparison.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "ued-complete-byte-tree-"));
const left = path.join(root, "left");
const right = path.join(root, "right");
const original = Buffer.from('{"alpha":"é","beta":1}\n', "utf8");
const variants = [
  ["whitespace", Buffer.from('{ "alpha": "é", "beta": 1 }\n', "utf8")],
  ["key-order", Buffer.from('{"beta":1,"alpha":"é"}\n', "utf8")],
  ["line-ending", Buffer.from('{"alpha":"é","beta":1}\r\n', "utf8")],
  ["unicode-escape", Buffer.from('{"alpha":"\\u00e9","beta":1}\n', "utf8")],
];
try {
  await Promise.all([mkdir(left), mkdir(right)]);
  const seed = async (directory, metadata = original, sidecar = "a".repeat(64) + "  deployment.manifest.json\n") => {
    await writeFile(path.join(directory, "deployment.manifest.json"), metadata);
    await writeFile(path.join(directory, "deployment.manifest.sha256"), sidecar);
    await mkdir(path.join(directory, "runtime"), { recursive: true });
    await writeFile(path.join(directory, "runtime", "asset.bin"), Buffer.from([0, 1, 255]));
  };
  await seed(left);
  for (const [label, bytes] of variants) {
    await rm(right, { recursive: true, force: true });
    await mkdir(right);
    await seed(right, bytes);
    await assert.rejects(compareReleaseByteTrees(left, right, { label }), /BYTE_TREE_MISMATCH/u);
  }
  await rm(right, { recursive: true, force: true });
  await mkdir(right);
  await seed(right, original, "b".repeat(64) + "  deployment.manifest.json\n");
  await assert.rejects(compareReleaseByteTrees(left, right, { label: "sidecar" }), /BYTE_TREE_MISMATCH/u);
  await rm(right, { recursive: true, force: true });
  await mkdir(right);
  await seed(right);
  await writeFile(path.join(right, "runtime", "extra.bin"), "unexpected");
  await assert.rejects(compareReleaseByteTrees(left, right, { label: "extra-member" }), /BYTE_TREE_MISMATCH/u);
  console.log("Complete Candidate/Runtime byte comparison: PASS");
} finally {
  await rm(root, { recursive: true, force: true });
}
