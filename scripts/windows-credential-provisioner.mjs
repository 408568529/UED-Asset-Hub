import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import { lstat, mkdir, open, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { createEphemeralCredentialPayload, parseWindowsCredentialBundle } from "./windows-credential-schema.mjs";
import { b4bWindowsServiceName, isValidatedB4bServiceSidContext } from "./windows-service-identity.mjs";
import { validateCredentialStreams } from "./windows-credential-acl.mjs";
import { canonicalJson } from "./release-artifact-tree.mjs";
import { credentialCleanupEvidencePath, credentialOwnershipRecordPath, createCredentialArtifactOwnershipRecord, validateCredentialArtifactOwnershipRecord, writeCredentialCleanupEvidenceAtomically, writeCredentialOwnershipRecordAtomically } from "./credential-artifact-ownership.mjs";

const helperPath = "native/windows-dpapi-credential-helper/bin/ued-windows-dpapi-credential-helper.exe";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const contained = (root, file) => { const part = path.relative(root, file); return !!part && part !== ".." && !part.startsWith(`..${path.sep}`) && !path.isAbsolute(part); };
async function regular(file) { const detail = await lstat(file); if (!detail.isFile() || detail.isSymbolicLink() || detail.nlink > 1) throw new Error("credential artifact is not a regular unlinked file."); return detail; }
async function directory(dir) { const detail = await lstat(dir); if (!detail.isDirectory() || detail.isSymbolicLink()) throw new Error("credential directory is unsafe."); return detail; }
async function hashFile(file) { return new Promise((resolve, reject) => { const digest = createHash("sha256"), stream = createReadStream(file); stream.on("data", (part) => digest.update(part)); stream.once("error", reject); stream.once("end", () => resolve(digest.digest("hex"))); }); }

export async function validateCandidateDpapiHelper({ candidateRoot, candidateDigest }) {
  const root = path.resolve(candidateRoot), executable = path.join(root, ...helperPath.split("/")); if (!contained(root, executable)) throw new Error("candidate helper escapes root.");
  const [deployment, executableBytes, detail, componentText] = await Promise.all([readFile(path.join(root, "deployment.manifest.json"), "utf8"), readFile(executable), regular(executable), readFile(path.join(root, "native", "windows-dpapi-credential-helper", "bin", "ued-windows-dpapi-credential-helper.manifest.json"), "utf8")]);
  const component = JSON.parse(deployment).components?.windowsDpapiHelper, native = JSON.parse(componentText), digest = hash(executableBytes);
  if (!component || component.path !== helperPath || component.sha256 !== digest || JSON.parse(deployment).artifactSet?.digest !== candidateDigest || native.componentName !== "dpapi-helper" || native.sha256 !== digest || native.binary?.size !== detail.size) throw new Error("candidate DPAPI helper identity is invalid.");
  const provenance = JSON.parse(await readFile(path.join(root, "release.provenance.json"), "utf8"));
  const deploymentManifest = JSON.parse(deployment);
  const nativeSet = provenance.native;
  if (!nativeSet || typeof nativeSet.buildId !== "string" || !/^[a-f0-9]{64}$/u.test(nativeSet.setDigest || "") || !/^[a-f0-9]{64}$/u.test(nativeSet.aggregateManifestSha256 || "") || !/^[a-f0-9]{40}$/u.test(deploymentManifest.assetHub?.commit || "") || !/^[a-f0-9]{64}$/u.test(deploymentManifest.assetHub?.sourceArchiveSha256 || "")) throw new Error("Candidate Native Set binding is unavailable.");
  return { executable, sha256: digest, size: detail.size, nativeSetBindingIdentity: { nativeBuildId: nativeSet.buildId, nativeSetDigest: nativeSet.setDigest, aggregateManifestSha256: nativeSet.aggregateManifestSha256, sourceCommit: deploymentManifest.assetHub.commit, sourceArchiveSha256: deploymentManifest.assetHub.sourceArchiveSha256 } };
}

export async function cleanupOwnedCredentialBundle({ lifecycle, candidateRoot, candidateDigest, b4bRoot, validateAcl, validateStreams = validateCredentialStreams, platform = process.platform }) {
  const context = lifecycle?.serviceSidContext, runId = lifecycle?.identity?.b4bRunId, serviceName = lifecycle?.identity?.serviceName;
  const phaseAllowed = ["CREDENTIAL_PROVISION", "ACL_READY", "PRESTART_READY", "START", "STOPPED", "UNINSTALLED"].includes(lifecycle?.phase);
  if (platform !== "win32" || !phaseAllowed || lifecycle.serviceRunning !== false || lifecycle.identity?.kind !== "b4b" || !isValidatedB4bServiceSidContext(context) || context.identity.serviceName !== serviceName || context.identity.b4bRunId !== runId || context.sidType !== "UNRESTRICTED" || serviceName !== b4bWindowsServiceName(runId) || typeof validateAcl !== "function" || typeof validateStreams !== "function") throw new Error("credential cleanup requires a validated, stopped B4B service identity.");
  if (!/^[a-f0-9]{64}$/u.test(candidateDigest || "")) throw new Error("credential cleanup Candidate identity is invalid.");
  const root = path.win32.resolve(b4bRoot), expectedRoot = path.win32.resolve("D:\\UED-Asset-Hub-Staging\\b4b", runId);
  if (root.toLowerCase() !== expectedRoot.toLowerCase()) throw new Error("credential cleanup root is not the exact B4B run root.");
  const candidate = path.win32.resolve(candidateRoot), expectedCandidate = path.win32.join(root, "current");
  if (candidate.toLowerCase() !== expectedCandidate.toLowerCase()) throw new Error("credential cleanup Candidate root is not the exact run Candidate.");
  const recordPath = credentialOwnershipRecordPath(root), cleanupPath = credentialCleanupEvidencePath(root);
  const record = validateCredentialArtifactOwnershipRecord(JSON.parse(await readFile(recordPath, "utf8")), { runId, serviceIdentity: serviceName, candidateDigest });
  const credentialDirectory = path.win32.join(root, "credentials"), output = path.win32.resolve(root, ...record.protectedBundleRelativePath.split("/"));
  if (output.toLowerCase() !== path.win32.resolve(credentialDirectory, `${serviceName}.credentials.dpapi`).toLowerCase()) throw new Error("credential ownership record path is not canonical.");
  const [helper] = await Promise.all([validateCandidateDpapiHelper({ candidateRoot: candidate, candidateDigest }), directory(root), directory(candidate), directory(credentialDirectory)]);
  if (canonicalJson(helper.nativeSetBindingIdentity) !== canonicalJson(record.nativeSetBindingIdentity) || helper.sha256 !== record.dpapiHelperIdentity.sha256 || helper.size !== record.dpapiHelperIdentity.size) throw new Error("credential ownership record does not match the current Candidate/native identity.");
  const entries = await readdir(credentialDirectory);
  if (entries.length !== 1 || entries[0] !== path.win32.basename(output)) throw new Error("credential cleanup found an unowned directory residual.");
  const detail = await regular(output), createdAt = detail.birthtime.toISOString(), lastWriteAt = detail.mtime.toISOString();
  if (detail.size !== record.protectedBundleSize || Math.abs(Date.parse(createdAt) - Date.parse(record.createdAt)) > 2_000 || Math.abs(Date.parse(lastWriteAt) - Date.parse(record.lastWriteAt)) > 2_000 || await hashFile(output) !== record.protectedBundleSha256) throw new Error("credential artifact filesystem identity differs from its creation record.");
  const directoryAcl = await validateAcl({ output: credentialDirectory, serviceContext: context, kind: "directory" });
  const fileAcl = await validateAcl({ output, serviceContext: context, kind: "file" });
  await validateStreams({ output, serviceContext: context, kind: "file" });
  if (canonicalJson({ directory: directoryAcl, file: fileAcl }) !== canonicalJson(record.aclIdentity)) throw new Error("credential artifact owner/ACL changed since provisioning.");
  await rm(output);
  try { await lstat(output); throw new Error("protected credential bundle remains after cleanup."); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if ((await readdir(credentialDirectory)).length !== 0) throw new Error("credential directory contains a residual after opaque cleanup.");
  const cleanupEvidence = { schemaVersion: 1, runId, provisioningId: record.provisioningId, serviceIdentity: serviceName, protectedBundleSha256: record.protectedBundleSha256, protectedBundleSize: record.protectedBundleSize, deletedAt: new Date().toISOString(), result: "OPAQUE_DELETE_VERIFIED" };
  await writeCredentialCleanupEvidenceAtomically(cleanupPath, cleanupEvidence);
  return { protectedBundleResidual: false, plaintextResidual: false, credentialDirectoryResidual: true, ownershipRecordPath: recordPath, cleanupEvidencePath: cleanupPath, provisioningId: record.provisioningId, sha256: record.protectedBundleSha256, size: record.protectedBundleSize, forcedTermination: false };
}

export function protectWithDpapi({ executable, plaintext, output }) { return new Promise((resolve, reject) => { const child = spawn(executable, ["--operation", "protect", "--output", output], { stdio: ["pipe", "ignore", "ignore"], windowsHide: true, shell: false }); child.once("error", () => reject(new Error("DPAPI protect unavailable."))); child.stdin.end(plaintext); child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("DPAPI protect failed."))); }); }
export function validateWithDpapi({ executable, output }) { return new Promise((resolve, reject) => { const child = spawn(executable, ["--operation", "unprotect", "--input", output], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true, shell: false }); const chunks = []; let bytes = 0, invalid = false; child.stdout.on("data", (chunk) => { bytes += chunk.length; if (bytes > 64 * 1024) { invalid = true; child.stdout.destroy(); return; } chunks.push(Buffer.from(chunk)); }); child.once("error", () => reject(new Error("DPAPI validation unavailable."))); child.once("exit", (code) => { if (code !== 0 || invalid) { chunks.forEach((chunk) => chunk.fill(0)); return reject(new Error("DPAPI validation failed.")); } const plaintext = Buffer.concat(chunks); chunks.forEach((chunk) => chunk.fill(0)); try { parseWindowsCredentialBundle(plaintext.toString("utf8")); resolve(); } catch { reject(new Error("DPAPI credential schema validation failed.")); } finally { plaintext.fill(0); } }); }); }
export async function inspectB4bSecretLeak({ b4bRoot, secrets }) {
  if (secrets.some((secret) => process.argv.includes(secret) || Object.values(process.env).includes(secret))) return true;
  const pending = [path.join(b4bRoot, "logs"), path.join(b4bRoot, "service")];
  while (pending.length) {
    const current = pending.pop(); let entries; try { entries = await readdir(current, { withFileTypes: true }); } catch (error) { if (error.code === "ENOENT") continue; throw new Error("credential leak scan could not inspect B4B output."); }
    for (const entry of entries) {
      const file = path.join(current, entry.name), detail = await lstat(file);
      if (detail.isSymbolicLink()) throw new Error("credential leak scan encountered a link.");
      if (detail.isDirectory()) { pending.push(file); continue; }
      if (!detail.isFile() || !/\.(?:log|xml)$/iu.test(entry.name)) continue;
      const content = await readFile(file);
      const leaked = secrets.some((secret) => content.includes(Buffer.from(secret, "utf8")));
      content.fill(0);
      if (leaked) return true;
    }
  }
  return false;
}

export async function provisionCredentialBundle({ lifecycle, candidateRoot, candidateDigest, b4bRoot, applyAcl, validateAcl, validateStreams = validateCredentialStreams, validateBundle = validateWithDpapi, inspectSecretLeak = inspectB4bSecretLeak, random = randomBytes, protect = protectWithDpapi, platform = process.platform }) {
  const serviceContext = lifecycle?.serviceSidContext;
  if (platform !== "win32" || lifecycle?.phase !== "CREDENTIAL_PROVISION" || lifecycle?.serviceInstalled !== true || lifecycle?.serviceRunning !== false || lifecycle?.identity?.kind !== "b4b" || !isValidatedB4bServiceSidContext(serviceContext) || serviceContext.identity.serviceName !== lifecycle.identity.serviceName || serviceContext.identity.b4bRunId !== lifecycle.identity.b4bRunId || serviceContext.sidType !== "UNRESTRICTED") throw new Error("credential provisioning requires a validated B4B Service SID.");
  if (typeof applyAcl !== "function" || typeof validateAcl !== "function" || typeof validateStreams !== "function" || typeof validateBundle !== "function" || typeof inspectSecretLeak !== "function") throw new Error("credential provisioning authorities are incomplete.");
  const root = path.resolve(b4bRoot), credentials = path.join(root, "credentials"), output = path.join(credentials, `${lifecycle.identity.serviceName}.credentials.dpapi`); if (!contained(root, credentials) || !contained(root, output)) throw new Error("credential output escapes B4B root.");
  await mkdir(credentials, { recursive: true }); const directory = await lstat(credentials); if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error("credential root is unsafe.");
  await applyAcl({ output: credentials, serviceContext, kind: "directory" }); const directoryAcl = await validateAcl({ output: credentials, serviceContext, kind: "directory" });
  let outputHandle; try { outputHandle = await open(output, "wx", 0o600); await outputHandle.close(); } catch { throw new Error("credential output already exists."); }
  const payload = createEphemeralCredentialPayload(random), secretValues = Object.values(payload.credentials); let plaintext = Buffer.from(JSON.stringify(payload), "utf8"); for (const field of Object.keys(payload.credentials)) payload.credentials[field] = "";
  try {
    const helper = await validateCandidateDpapiHelper({ candidateRoot, candidateDigest });
    parseWindowsCredentialBundle(plaintext.toString("utf8"));
    await protect({ executable: helper.executable, plaintext, output });
    plaintext.fill(0); plaintext = null;
    const bundleStat = await regular(output);
    await applyAcl({ output, serviceContext });
    const fileAcl = await validateAcl({ output, serviceContext, kind: "file" });
    await validateStreams({ output, serviceContext, kind: "file" });
    await validateBundle({ executable: helper.executable, output });
    const credentialFiles = await readdir(credentials);
    if (credentialFiles.length !== 1 || credentialFiles[0] !== path.basename(output)) throw new Error("credential plaintext residual detected.");
    if (await inspectSecretLeak({ output, helper: helper.executable, b4bRoot: root, secrets: secretValues })) throw new Error("credential secret leak detected.");
    const protectedBundleSha256 = await hashFile(output), provisioningId = randomUUID();
    const ownership = createCredentialArtifactOwnershipRecord({ provisioningId, runId: lifecycle.identity.b4bRunId, serviceIdentity: lifecycle.identity.serviceName, protectedBundleRelativePath: path.relative(root, output).replaceAll("\\", "/"), protectedBundleSha256, protectedBundleSize: bundleStat.size, createdAt: bundleStat.birthtime.toISOString(), lastWriteAt: bundleStat.mtime.toISOString(), dpapiHelperIdentity: { componentName: "dpapi-helper", relativePath: helperPath, sha256: helper.sha256, size: helper.size }, candidateDigest, nativeSetBindingIdentity: helper.nativeSetBindingIdentity, aclIdentity: { directory: directoryAcl, file: fileAcl }, providerCredentialPresent: false });
    const ownershipRecord = await writeCredentialOwnershipRecordAtomically(credentialOwnershipRecordPath(root), ownership);
    const evidence = { provisioningId, schemaVersion: 1, credentialClass: "ephemeral-run-local", providerCredentialPresent: false, requiredFieldsSatisfied: true, dpapiScope: "machine", dpapiHelperSha256: helper.sha256, candidateDigest, serviceIdentity: lifecycle.identity.serviceName, protectedBundleRelativePath: ownership.protectedBundleRelativePath, protectedBundleSha256, protectedBundleSize: bundleStat.size, ownershipRecordPath: ownershipRecord.path, ownershipRecordSha256: ownershipRecord.sha256, ownershipRecordPersisted: true, aclValidated: true, validationPassed: true, plaintextResidual: false, secretLeak: false, formalCredentialAccessed: false };
    secretValues.fill("");
    return { evidence, cleanup: ({ lifecycle: currentLifecycle } = {}) => cleanupOwnedCredentialBundle({ lifecycle: currentLifecycle, candidateRoot, candidateDigest, b4bRoot: root, validateAcl, validateStreams, platform }) };
  } catch (error) { if (plaintext) plaintext.fill(0); secretValues.fill(""); await rm(output, { force: true }); throw error; }
}
