import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createReleaseSecuritySet, loadProtectedReleaseSecuritySet, materializeNextSecurityCache, protectReleaseSecuritySet, releaseSecuritySetMetadata, secureReleaseSecurityDirectory, verifyNextSecurityCache } from "./release-security-set.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "ued-dpapi-security-smoke-"));
const sourceCommit = "3".repeat(40);
const sourceArchiveSha256 = "4".repeat(64);
const authorizationId = "phase1-windows-dpapi-smoke";
const now = Date.now();
const options = { sourceCommit, sourceArchiveSha256, authorizationId, now, nextVersion: "15.5.19" };
const securitySet = createReleaseSecuritySet({ sourceCommit, sourceArchiveSha256, authorizationId, now });
const protectedPath = path.join(root, "authority.dpapi");
const workspace = path.join(root, "workspace");

let stage = "PLATFORM";
try {
  assert.equal(process.platform, "win32");
  stage = "DIRECTORY_ACL";
  assert.equal((await secureReleaseSecurityDirectory(root)).aclReadback, "PASS");
  stage = "DPAPI_PROTECT";
  await protectReleaseSecuritySet(securitySet, protectedPath);
  const protectedBytes = await readFile(protectedPath, "utf8");
  stage = "DPAPI_UNPROTECT";
  const loaded = await loadProtectedReleaseSecuritySet(protectedPath, options);
  assert.deepEqual(loaded, securitySet);
  assert.equal(protectedBytes.includes(securitySet.previewModeId), false);
  stage = "CACHE_MATERIALIZATION";
  const metadata = releaseSecuritySetMetadata(loaded, options);
  await materializeNextSecurityCache({ workspace, securitySet: loaded, ...options });
  assert.equal((await verifyNextSecurityCache({ workspace, securitySet: loaded, options })).cacheInputsMatchAuthority, true);
  assert.equal(JSON.stringify(metadata).includes(securitySet.previewModeSigningKey), false);
  process.stdout.write("[Release Security Set] Windows DPAPI protect/unprotect and cache materialization: PASS\n");
} catch {
  process.stderr.write(`[Release Security Set] Windows DPAPI protect/unprotect and cache materialization: FAIL:${stage}\n`);
  process.exitCode = 1;
} finally {
  await rm(root, { recursive: true, force: true });
}
