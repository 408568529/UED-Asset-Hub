import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { constants } from "node:fs";
import { open, lstat, realpath, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { exact, hash, parseStrictJson } from "./release-json-contract.mjs";
import { readApprovalRecord, assertApprovalSelection, assertPermittedExecution, approvalPolicyVersion } from "./release-authority-approval.mjs";
const exec = promisify(execFile);
const configPath = process.platform === "win32" ? "C:\\ProgramData\\UED-Release-Authority\\trust-config.json" : "/Library/Application Support/UED-Release-Authority/trust-config.json";
const admitted = new WeakSet();
export function assertTrustedAdmission(context, authority) {
  if (!admitted.has(context) || context.authority !== authority) throw new Error("Trusted approval admission required");
  return context;
}
export function assertTrustConfiguration(config) {
  exact(config, ["schemaVersion", "policyVersion", "approvalRoot", "permissionRoot", "operatorPrincipal", "consumerCodeRoot"], "trust configuration");
  if (config.schemaVersion !== 2 || config.policyVersion !== approvalPolicyVersion) throw new Error("trust policy/security identities");
  for (const key of ["approvalRoot", "permissionRoot", "consumerCodeRoot"]) if (typeof config[key] !== "string" || !path.isAbsolute(config[key])) throw new Error("trust absolute root");
  if (!/^S-1-5-21-\d+-\d+-\d+-\d+$/u.test(config.operatorPrincipal || "")) throw new Error("trusted operator SID");
  const codeRoot = path.resolve(config.consumerCodeRoot).toLowerCase();
  if ([config.approvalRoot, config.permissionRoot].map((root) => path.resolve(root).toLowerCase()).some((root) => root === codeRoot || root.startsWith(codeRoot + path.sep) || codeRoot.startsWith(root + path.sep))) throw new Error("trust root overlaps consumer code");
  return config;
}
async function windowsPrincipal() {
  const { stdout } = await exec("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value"], { windowsHide: true });
  return stdout.trim();
}
export async function currentSecurityPrincipal() {
  if (process.platform === "win32") return windowsPrincipal();
  if (process.platform === "darwin" || process.platform === "linux") return "uid:" + process.getuid();
  throw new Error("Unsupported approval security platform");
}
// The configured administrator is trusted; these checks exclude unexpected ordinary writers.
export function assertTrustedOperatorObservation(token, config) {
  exact(token, ["principal", "account", "resolvedAccount", "isAdministrator", "elevated", "integrityLevel"], "operator token observation");
  if (token.principal !== config.operatorPrincipal || typeof token.account !== "string" || !token.account.includes("\\") || typeof token.resolvedAccount !== "string" || token.account.toLowerCase() !== token.resolvedAccount.toLowerCase() || token.isAdministrator !== true || token.elevated !== true || !Number.isSafeInteger(token.integrityLevel) || token.integrityLevel < 12288) throw new Error("Trusted operator SID/high-integrity administrator token required");
  return token;
}
const trustedWriters = (config) => [config.operatorPrincipal, "S-1-5-18", "S-1-5-32-544"];
const targetWriteRights = 852310 | 64 | 0x50000000;
const ancestorReplaceRights = 64 | 262144 | 524288 | 0x10000000;
export function assertPermissionObservation(observation, config) {
  exact(observation, ["token", "entries"], "permission observation");
  assertTrustedOperatorObservation(observation.token, config);
  if (!Array.isArray(observation.entries) || !observation.entries.length) throw new Error("permission entries required");
  const trusted = trustedWriters(config);
  for (const [index, entry] of observation.entries.entries()) {
    exact(entry, ["path", "owner", "ownerAccount", "unsafeLink", "rules"], "permission entry");
    if (typeof entry.path !== "string" || !path.win32.isAbsolute(entry.path) || entry.unsafeLink !== false || !Array.isArray(entry.rules)) throw new Error("untrusted permission path/link");
    const resolved = path.win32.resolve(entry.path).toLowerCase();
    const volumeRoot = path.win32.parse(resolved).root.toLowerCase();
    const isVolumeRoot = resolved === volumeRoot;
    const trustedInstallerRoot = isVolumeRoot && /^S-1-5-80-(?:\d+-){4}\d+$/u.test(entry.owner) && entry.ownerAccount?.toLowerCase() === "nt service\\trustedinstaller";
    if (!trusted.includes(entry.owner) && !trustedInstallerRoot) throw new Error("untrusted permission owner");
    for (const rule of entry.rules) {
      exact(rule, ["principal", "rights", "inheritOnly"], "permission ACL rule");
      if (typeof rule.principal !== "string" || !Number.isSafeInteger(rule.rights) || typeof rule.inheritOnly !== "boolean") throw new Error("permission ACL observation");
      if (trusted.includes(rule.principal) || rule.inheritOnly) continue;
      const dangerous = index === 0 ? rule.rights & targetWriteRights : rule.rights & (ancestorReplaceRights | (isVolumeRoot ? 0 : 65536));
      if (dangerous) throw new Error("untrusted write/replace permission");
    }
  }
  return observation;
}
const windowsTokenScript = `$ErrorActionPreference='Stop'; Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class UedOperatorToken {
 [DllImport("advapi32.dll", SetLastError=true)] static extern bool GetTokenInformation(IntPtr token,int kind,IntPtr buffer,int length,out int needed);
 public static int Read(IntPtr token,int kind) {
  int needed; GetTokenInformation(token,kind,IntPtr.Zero,0,out needed);
  if(needed<=0) throw new InvalidOperationException("token observation unavailable");
  IntPtr buffer=Marshal.AllocHGlobal(needed);
  try { if(!GetTokenInformation(token,kind,buffer,needed,out needed)) throw new InvalidOperationException("token observation failed");
   if(kind==20) return Marshal.ReadInt32(buffer);
   IntPtr sid=Marshal.ReadIntPtr(buffer); int count=Marshal.ReadByte(sid,1);
   if(count<1) throw new InvalidOperationException("integrity SID unavailable");
   return Marshal.ReadInt32(sid,8+4*(count-1));
  } finally {Marshal.FreeHGlobal(buffer);}
 }
}
'@;
$id=[System.Security.Principal.WindowsIdentity]::GetCurrent(); $principal=[System.Security.Principal.WindowsPrincipal]::new($id); $token=@{principal=$id.User.Value;account=$id.Name;resolvedAccount=$id.User.Translate([System.Security.Principal.NTAccount]).Value;isAdministrator=$principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator);elevated=([UedOperatorToken]::Read($id.Token,20) -eq 1);integrityLevel=[UedOperatorToken]::Read($id.Token,25)};`;
async function windowsObservation(file) {
  const script = `${windowsTokenScript} $entries=@(); $p='${path.resolve(file).replaceAll("'", "''")}'; do { $item=Get-Item -LiteralPath $p -Force; $acl=Get-Acl -LiteralPath $p; $links=$false; if(-not $item.PSIsContainer) { $links=@(& C:\\Windows\\System32\\fsutil.exe hardlink list $p); if($LASTEXITCODE -ne 0){throw 'hardlink inspection failed'}; $links=($links.Count -ne 1) }; $entries+=@{path=$p;owner=$acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value;ownerAccount=$acl.GetOwner([System.Security.Principal.NTAccount]).Value;unsafeLink=(($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 -or $links);rules=@($acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]) | Where-Object {$_.AccessControlType -eq 'Allow'} | ForEach-Object {@{principal=$_.IdentityReference.Value;rights=[long]$_.FileSystemRights;inheritOnly=(($_.PropagationFlags -band [System.Security.AccessControl.PropagationFlags]::InheritOnly) -ne 0)}})}; $parent=Split-Path -Parent $p; if(-not $parent -or $parent -eq $p){break}; $p=$parent } while($true); @{token=$token;entries=@($entries)}|ConvertTo-Json -Depth 8 -Compress`;
  const { stdout } = await exec("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true });
  return parseStrictJson(Buffer.from(stdout.trim()));
}
export async function assertProtectedPath(file, config, mode = "consumer") {
  if (process.platform !== "win32") throw new Error("Live trusted operator admission requires Windows");
  const observation = await windowsObservation(file);
  assertPermissionObservation(observation, config, mode);
  if (await realpath(file) !== path.resolve(file)) throw new Error("protected root realpath mismatch");
}
export async function loadTrustConfiguration(mode = "consumer") {
  if (process.platform !== "win32") throw new Error("Live trusted operator admission requires Windows");
  if (process.env.NODE_OPTIONS || process.execArgv.length) throw new Error("Unapproved Node execution modifiers");
  const bytes = await readFile(configPath); const config = assertTrustConfiguration(parseStrictJson(bytes));
  await assertProtectedPath(configPath, config, mode);
  for (const directory of [config.approvalRoot, config.permissionRoot, config.consumerCodeRoot]) await assertProtectedPath(directory, config, mode);
  if (await realpath(path.join(import.meta.dirname, "..")) !== await realpath(config.consumerCodeRoot)) throw new Error("Consumer code is outside protected code root");
  async function protectTree(directory) {
    for (const name of await readdir(directory)) {
      if ([".git"].includes(name)) continue;
      const file = path.join(directory, name); const details = await lstat(file);
      await assertProtectedPath(file, config, mode);
      if (details.isDirectory()) await protectTree(file);
    }
  }
  await protectTree(config.consumerCodeRoot);
  await assertProtectedPath(process.execPath, config, mode);
  const entrypoint = process.argv[1] && await realpath(process.argv[1]);
  const relative = entrypoint && path.relative(config.consumerCodeRoot, entrypoint);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Untrusted consumer/producer entrypoint");
  await assertProtectedPath(entrypoint, config, mode);
  return config;
}
async function readProtected(file, config) {
  await assertProtectedPath(file, config);
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const info = await handle.stat(); if (!info.isFile() || info.nlink !== 1) throw new Error("protected record file type");
    const bytes = await handle.readFile(); const after = await handle.stat(); const linked = await lstat(file);
    if (info.ino !== linked.ino || info.dev !== linked.dev || info.size !== after.size || info.mtimeMs !== after.mtimeMs) throw new Error("protected record changed while reading");
    return bytes;
  } finally { await handle.close(); }
}
export async function loadTrustedReleaseSelection({ approvalIdentity, planIdentity, authorityBytes, receiptBytes, bindingBytes, executionRunId, candidateLabel, phase }) {
  hash(approvalIdentity, "approval selector"); hash(planIdentity, "execution plan selector");
  const config = await loadTrustConfiguration();
  const approval = readApprovalRecord(await readProtected(path.join(config.approvalRoot, approvalIdentity + ".json"), config));
  if (approval.approvalIdentity !== approvalIdentity || approval.approvalProvenance.operatorPrincipal !== config.operatorPrincipal) throw new Error("protected approval identity/principal");
  const planBytes = await readProtected(path.join(config.permissionRoot, planIdentity + ".json"), config);
  const plan = parseStrictJson(planBytes);
  const { canonicalJson } = await import("./release-artifact-tree.mjs");
  if (plan.planIdentity !== planIdentity || !planBytes.equals(Buffer.from(canonicalJson(plan) + "\n"))) throw new Error("protected permission raw identity");
  const authority = assertApprovalSelection(approval, authorityBytes, receiptBytes);
  const permitted = assertPermittedExecution({ approval, plan, bindingBytes, executionRunId, candidateLabel, phase });
  for (const trusted of [config.approvalRoot, config.permissionRoot, configPath, config.consumerCodeRoot]) for (const locator of Object.values(permitted.binding.locators)) {
    const a = path.resolve(trusted).toLowerCase(), b = path.resolve(locator).toLowerCase();
    if (a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep)) throw new Error("Trusted root overlaps execution locator");
  }
  const journalPath = path.join(config.permissionRoot, "journals", permitted.execution.journalIdentity + ".jsonl");
  await assertOperatorJournal(journalPath, config);
  const selectedReceipts = Object.fromEntries(["sourceManifestSha256", "nativeManifestSha256", "dependencyReceiptSha256"].map((key) => [key, parseStrictJson(receiptBytes[key])]));
  const context = { approval, authority, plan, journalPath, selectedReceipts, ...permitted };
  const freeze = (value) => { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } };
  freeze(context);
  admitted.add(context); return context;
}

export function assertJournalPermissionObservation(observation, config) {
  exact(observation, ["owner", "unsafeLink", "allows"], "operator journal permissions");
  if (![config.operatorPrincipal, "S-1-5-18", "S-1-5-32-544"].includes(observation.owner) || observation.unsafeLink || !Array.isArray(observation.allows)) throw new Error("Journal owner/link");
  let append = false;
  for (const rule of observation.allows) {
    exact(rule, ["principal", "rights"], "journal ACL rule");
    if (!Number.isSafeInteger(rule.rights)) throw new Error("Journal ACL rights");
    const mutable = rule.rights & 852310;
    if (mutable && ![config.operatorPrincipal, "S-1-5-18", "S-1-5-32-544"].includes(rule.principal)) throw new Error("Journal untrusted writer");
    if ([config.operatorPrincipal, "S-1-5-32-544"].includes(rule.principal) && (rule.rights & 4)) append = true;
  }
  if (!append) throw new Error("Journal append grant missing");
}
async function assertOperatorJournal(file, config) {
  if (process.platform !== "win32") throw new Error("Live operator journal admission requires Windows NTFS ACL verification");
  await assertProtectedPath(path.dirname(file), config);
  const script = `$ErrorActionPreference='Stop'; $p='${path.resolve(file).replaceAll("'", "''")}'; $i=Get-Item -LiteralPath $p -Force; $a=Get-Acl -LiteralPath $p; $links=@(& C:\\Windows\\System32\\fsutil.exe hardlink list $p); if($LASTEXITCODE -ne 0){throw 'hardlink inspection failed'}; @{owner=$a.GetOwner([System.Security.Principal.SecurityIdentifier]).Value;unsafeLink=(($i.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 -or $links.Count -ne 1);allows=@($a.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]) | Where-Object {$_.AccessControlType -eq 'Allow'} | ForEach-Object {@{principal=$_.IdentityReference.Value;rights=[long]$_.FileSystemRights}})}|ConvertTo-Json -Depth 8 -Compress`;
  const { stdout } = await exec("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true });
  assertJournalPermissionObservation(parseStrictJson(Buffer.from(stdout.trim())), config);
}

const historicalSelections = new WeakSet();
export async function loadProtectedHistoricalRoots() {
  const config = await loadTrustConfiguration();
  const roots = parseStrictJson(await readProtected(path.join(config.permissionRoot, "historical-roots.json"), config));
  const { inventoryHistoricalRoots } = await import("./release-history-inventory.mjs");
  await inventoryHistoricalRoots(roots);
  for (const spec of Object.values(roots)) Object.freeze(spec);
  Object.freeze(roots); historicalSelections.add(roots); return roots;
}
export function assertTrustedHistoricalRoots(roots) { if (!historicalSelections.has(roots)) throw new Error("Protected approved historical root selection required"); }
