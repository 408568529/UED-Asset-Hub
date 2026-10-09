import { parseStrictJson } from "./release-json-contract.mjs";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const releaseSecuritySetSchemaVersion = 1;
export const supportedNextVersion = "15.5.19";
export const maximumEpochMs = 14 * 24 * 60 * 60 * 1000;
const maximumProtectedBytes = 64 * 1024;
const entropy = Buffer.from("UED-Asset-Hub/ReleaseSecuritySet/v1", "utf8");
const secretFields = Object.freeze(["previewModeId", "previewModeSigningKey", "previewModeEncryptionKey", "serverActionsEncryptionKey"]);

const encoded = (script) => Buffer.from(script, "utf16le").toString("base64");
const psScript = `Add-Type -AssemblyName System.Security; $inputBytes = [Console]::OpenStandardInput(); $memory = New-Object IO.MemoryStream; $inputBytes.CopyTo($memory); $data = $memory.ToArray(); $entropy = [Text.Encoding]::UTF8.GetBytes('UED-Asset-Hub/ReleaseSecuritySet/v1'); if ($env:UED_SECURITY_SET_OPERATION -eq 'protect') { $result = [Security.Cryptography.ProtectedData]::Protect($data, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result)) } elseif ($env:UED_SECURITY_SET_OPERATION -eq 'unprotect') { $cipher = [Convert]::FromBase64String([Text.Encoding]::UTF8.GetString($data)); $result = [Security.Cryptography.ProtectedData]::Unprotect($cipher, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::OpenStandardOutput().Write($result, 0, $result.Length) } elseif ($env:UED_SECURITY_SET_OPERATION -eq 'secure-directory') { $context = [Text.Encoding]::UTF8.GetString($data) | ConvertFrom-Json; $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User; $acl = New-Object Security.AccessControl.DirectorySecurity; $acl.SetAccessRuleProtection($true, $false); $acl.SetOwner($owner); $allow = [Security.AccessControl.AccessControlType]::Allow; $inherit = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit; foreach ($sid in @($owner, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'), [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))) { $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, [Security.AccessControl.FileSystemRights]::FullControl, $inherit, [Security.AccessControl.PropagationFlags]::None, $allow)) }; Set-Acl -LiteralPath $context.path -AclObject $acl; $actual = Get-Acl -LiteralPath $context.path; $rules = @($actual.Access); if (-not $actual.AreAccessRulesProtected -or $rules.Count -ne 3 -or @($rules | Where-Object { $_.AccessControlType -ne $allow -or $_.IsInherited -or $_.FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl -or $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($owner.Value, 'S-1-5-18', 'S-1-5-32-544') }).Count -ne 0) { exit 3 }; [Console]::Out.Write('ACL_PASS') } else { exit 2 }`;

function invokeDpapi(operation, input) {
  if (process.platform !== "win32") throw new Error("Release security set DPAPI is available only on Windows.");
  return new Promise((resolve, reject) => {
    const systemRoot = "C:\\Windows";
    const powershell = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const child = spawn(powershell, ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded(psScript)], { stdio: ["pipe", "pipe", "ignore"], windowsHide: true, env: { SystemRoot: systemRoot, WINDIR: systemRoot, UED_SECURITY_SET_OPERATION: operation } });
    const chunks = [];
    let length = 0;
    child.stdout.on("data", (chunk) => {
      length += chunk.length;
      if (length > maximumProtectedBytes) { child.kill(); reject(new Error("Release security set provider output is invalid.")); return; }
      chunks.push(chunk);
    });
    child.once("error", () => reject(new Error("Release security set provider is unavailable.")));
    child.once("close", (code) => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error("Release security set provider failed.")));
    child.stdin.end(input);
  });
}

export function createReleaseSecuritySet({ sourceCommit, sourceArchiveSha256, authorizationId, now = Date.now(), bytes = randomBytes }) {
  if (!/^[a-f0-9]{40}$/u.test(sourceCommit || "") || !/^[a-f0-9]{64}$/u.test(sourceArchiveSha256 || "") || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/u.test(authorizationId || "") || !Number.isSafeInteger(now)) throw new Error("SECURITY_SET_AUTHORITY_INVALID");
  const hex = (size) => bytes(size).toString("hex");
  const value = {
    schemaVersion: releaseSecuritySetSchemaVersion,
    securitySetId: bytes(16).toString("hex"),
    nextVersion: supportedNextVersion,
    authority: { sourceCommit, sourceArchiveSha256, authorizationId },
    epoch: { createdAt: now, expiresAt: now + maximumEpochMs },
    previewModeId: hex(16),
    previewModeSigningKey: hex(32),
    previewModeEncryptionKey: hex(32),
    serverActionsEncryptionKey: bytes(32).toString("base64"),
  };
  validateReleaseSecuritySet(value, { sourceCommit, sourceArchiveSha256, authorizationId, now });
  return value;
}

export function validateReleaseSecuritySet(value, { sourceCommit, sourceArchiveSha256, authorizationId, now = Date.now(), nextVersion = supportedNextVersion } = {}) {
  const fail = () => { throw new Error("SECURITY_SET_INVALID"); };
  if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== releaseSecuritySetSchemaVersion || value.nextVersion !== nextVersion || nextVersion !== supportedNextVersion) fail();
  if (!/^[a-f0-9]{32}$/u.test(value.securitySetId || "") || !value.authority || !value.epoch) fail();
  if (value.authority.sourceCommit !== sourceCommit || value.authority.sourceArchiveSha256 !== sourceArchiveSha256 || value.authority.authorizationId !== authorizationId) fail();
  if (!/^[a-f0-9]{40}$/u.test(value.authority.sourceCommit || "") || !/^[a-f0-9]{64}$/u.test(value.authority.sourceArchiveSha256 || "") || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/u.test(value.authority.authorizationId || "")) fail();
  if (!Number.isSafeInteger(value.epoch.createdAt) || !Number.isSafeInteger(value.epoch.expiresAt) || value.epoch.expiresAt <= now || value.epoch.createdAt > now || value.epoch.expiresAt - value.epoch.createdAt > maximumEpochMs) fail();
  if (!/^[a-f0-9]{32}$/u.test(value.previewModeId || "") || !/^[a-f0-9]{64}$/u.test(value.previewModeSigningKey || "") || !/^[a-f0-9]{64}$/u.test(value.previewModeEncryptionKey || "")) fail();
  let encryptionKey;
  try { encryptionKey = Buffer.from(value.serverActionsEncryptionKey, "base64"); } catch { fail(); }
  if (encryptionKey.length !== 32 || encryptionKey.toString("base64") !== value.serverActionsEncryptionKey) fail();
  const expectedKeys = ["authority", "epoch", ...secretFields, "nextVersion", "schemaVersion", "securitySetId"].sort();
  if (Object.keys(value).sort().join("\0") !== expectedKeys.join("\0") || Object.keys(value.authority).sort().join("\0") !== ["authorizationId", "sourceArchiveSha256", "sourceCommit"].sort().join("\0") || Object.keys(value.epoch).sort().join("\0") !== ["createdAt", "expiresAt"].sort().join("\0")) fail();
  return { securitySetId: value.securitySetId, schemaVersion: value.schemaVersion, nextVersion: value.nextVersion, authority: { ...value.authority }, epoch: { ...value.epoch }, validity: "VALID" };
}

export function nextSecurityCacheBytes(value, options) {
  validateReleaseSecuritySet(value, options);
  const preview = JSON.stringify({ previewModeId: value.previewModeId, previewModeSigningKey: value.previewModeSigningKey, previewModeEncryptionKey: value.previewModeEncryptionKey, expireAt: value.epoch.expiresAt });
  const serverActions = JSON.stringify({ "encryption.key": value.serverActionsEncryptionKey, "encryption.expire_at": value.epoch.expiresAt });
  return { preview: Buffer.from(preview, "utf8"), serverActions: Buffer.from(serverActions, "utf8") };
}

export async function materializeNextSecurityCache({ workspace, securitySet, nextVersion, sourceCommit, sourceArchiveSha256, authorizationId, now = Date.now() }) {
  const metadata = validateReleaseSecuritySet(securitySet, { sourceCommit, sourceArchiveSha256, authorizationId, now, nextVersion });
  const dist = path.join(workspace, ".next");
  const cache = path.join(dist, "cache");
  await rm(dist, { recursive: true, force: true });
  await mkdir(cache, { recursive: true });
  if (process.platform === "win32") await secureReleaseSecurityDirectory(cache);
  const inputs = nextSecurityCacheBytes(securitySet, { sourceCommit, sourceArchiveSha256, authorizationId, now, nextVersion });
  const previewPath = path.join(cache, ".previewinfo");
  const serverActionsPath = path.join(cache, ".rscinfo");
  await writeFile(previewPath, inputs.preview, { flag: "wx", mode: 0o600 });
  await writeFile(serverActionsPath, inputs.serverActions, { flag: "wx", mode: 0o600 });
  await verifyNextSecurityCache({ workspace, securitySet, options: { sourceCommit, sourceArchiveSha256, authorizationId, now, nextVersion } });
  return { ...metadata, cacheInputs: [".next/cache/.previewinfo", ".next/cache/.rscinfo"] };
}

export async function verifyNextSecurityCache({ workspace, securitySet, options }) {
  const expected = nextSecurityCacheBytes(securitySet, options);
  let preview;
  let serverActions;
  try {
    [preview, serverActions] = await Promise.all([readFile(path.join(workspace, ".next", "cache", ".previewinfo")), readFile(path.join(workspace, ".next", "cache", ".rscinfo"))]);
  } catch { throw new Error("SECURITY_CACHE_INPUT_MISSING"); }
  if (!preview.equals(expected.preview)) throw new Error("SECURITY_CACHE_PREVIEW_MISMATCH");
  if (!serverActions.equals(expected.serverActions)) throw new Error("SECURITY_CACHE_SERVER_ACTIONS_MISMATCH");
  return { securitySetId: securitySet.securitySetId, cacheInputsMatchAuthority: true };
}

export async function verifyNextSecurityAdoption({ workspace, securitySet, options }) {
  await verifyNextSecurityCache({ workspace, securitySet, options });
  let preview;
  let serverActions;
  try {
    [preview, serverActions] = await Promise.all([
      readFile(path.join(workspace, ".next", "prerender-manifest.json"), "utf8").then((text) => JSON.parse(text).preview),
      readFile(path.join(workspace, ".next", "server", "server-reference-manifest.json"), "utf8").then((text) => JSON.parse(text)),
    ]);
  } catch { throw new Error("SECURITY_MATERIAL_ADOPTION_OUTPUT_MISSING"); }
  if (!preview || preview.previewModeId !== securitySet.previewModeId || preview.previewModeSigningKey !== securitySet.previewModeSigningKey || preview.previewModeEncryptionKey !== securitySet.previewModeEncryptionKey) throw new Error("SECURITY_MATERIAL_MISMATCH: preview");
  if (serverActions.encryptionKey !== securitySet.serverActionsEncryptionKey) throw new Error("SECURITY_MATERIAL_MISMATCH: server-actions");
  return { securitySetId: securitySet.securitySetId, previewAdopted: true, serverActionsAdopted: true };
}

export async function protectReleaseSecuritySet(value, outputPath) {
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  try {
    const protectedBytes = await invokeDpapi("protect", plaintext);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, protectedBytes.toString("utf8"), { flag: "wx", mode: 0o600 });
    return { path: outputPath, protectedAtRest: true, provider: "Windows DPAPI CurrentUser" };
  } finally {
    plaintext.fill(0);
  }
}

export async function secureReleaseSecurityDirectory(directoryPath) {
  const result = await invokeDpapi("secure-directory", Buffer.from(JSON.stringify({ path: path.resolve(directoryPath) }), "utf8"));
  if (result.toString("ascii") !== "ACL_PASS") throw new Error("SECURITY_DIRECTORY_ACL_INVALID");
  return { protected: true, aclReadback: "PASS" };
}

export async function loadProtectedReleaseSecuritySet(inputPath, options) {
  let protectedBytes;
  try {
    const details = await lstat(inputPath);
    if (!details.isFile() || details.isSymbolicLink() || details.nlink !== 1 || details.size > maximumProtectedBytes) throw new Error("SECURITY_SET_AUTHORITY_INVALID");
    protectedBytes = await readFile(inputPath, "utf8");
  } catch (error) {
    if (error instanceof Error && error.message === "SECURITY_SET_AUTHORITY_INVALID") throw error;
    throw new Error("SECURITY_SET_AUTHORITY_UNAVAILABLE");
  }
  if (!/^[A-Za-z0-9+/=\r\n]+$/u.test(protectedBytes) || Buffer.byteLength(protectedBytes) > maximumProtectedBytes) throw new Error("SECURITY_SET_AUTHORITY_INVALID");
  let plaintext;
  try { plaintext = await invokeDpapi("unprotect", Buffer.from(protectedBytes.replace(/\s+/gu, ""), "ascii")); } catch { throw new Error("SECURITY_SET_AUTHORITY_UNAVAILABLE"); }
  let value;
  try { value = parseStrictJson(plaintext); } catch { throw new Error("SECURITY_SET_AUTHORITY_INVALID"); }
  finally { plaintext.fill(0); }
  validateReleaseSecuritySet(value, options);
  return value;
}

export function releaseSecuritySetMetadata(value, options) {
  return validateReleaseSecuritySet(value, options);
}
