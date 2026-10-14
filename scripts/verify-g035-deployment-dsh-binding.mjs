import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { artifactDigestAlgorithm } from "./release-artifact-tree.mjs";
import { createDeploymentManifest, preflightDeploymentManifest } from "./windows-deployment-contract.mjs";

const source = await readFile(new URL("./windows-release-constructor.mjs", import.meta.url), "utf8");
const fingerprint = "a".repeat(64);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const paths = { standaloneServer: "server.js", hostSupervisor: "scripts/host-supervisor.mjs", managedShutdownClient: "scripts/windows-managed-shutdown-client.mjs", windowsJobHelper: "native/windows-job-helper/bin/ued-windows-job-helper.exe", windowsPipeSecurityAdapter: "native/windows-pipe-security-adapter/bin/ued-windows-pipe-security-adapter.exe", windowsDpapiHelper: "native/windows-dpapi-credential-helper/bin/ued-windows-dpapi-credential-helper.exe", serviceTemplate: "service/windows/UEDAssetHub.xml.template", edgeTemplate: "service/windows/UEDAssetHubEdge.web.config.template", nodeArtifact: "service/windows/node-22.23.3-x64.artifact.json", winswArtifact: "service/windows/winsw-2.12.0-x64.artifact.json", dshVersion: "agent-integration/dsh/version.json", genuiPlugin: "agent-integration/dsh/genui-plugin.json", dshOverlay: "agent-integration/dsh/asset-hub-agent.overlay.yml", restrictedAgentPreset: "agent-integration/dsh/agent-presets/asset-hub-restricted/agent.cordis.yml", restrictedPreset: "agent-integration/dsh/agent-presets/asset-hub-restricted/preset.yml", genuiRestrictedAgentPreset: "agent-integration/dsh/agent-presets/asset-hub-genui-restricted/agent.cordis.yml", genuiRestrictedPreset: "agent-integration/dsh/agent-presets/asset-hub-genui-restricted/preset.yml", releaseProvenance: "release.provenance.json" };
const files = Object.entries(paths).map(([component, filePath]) => ({ component, path: filePath, size: 1, sha256: hash(filePath) }));
const artifactSet = { algorithm: artifactDigestAlgorithm, digest: hash("g035-artifact-set"), fileCount: files.length, totalBytes: files.length, files };
const dsh = { version: "0.1.1-rc.2", commit: "b150a551b8d465e31e418e1b2eaf5e79bbb7d28e", sourceFingerprint: fingerprint };
const components = Object.fromEntries(files.map((file) => [file.component, { path: file.path, sha256: file.sha256, version: "fixture" }]));
const manifest = createDeploymentManifest({ version: "0.1.0", commit: "1".repeat(40), sourceArchiveSha256: hash("source"), artifactSet, dsh, components, buildId: "fixture-build", runtimeMetadataSchemaVersion: "3", operationalStorageSchemaVersion: "1", formalDataContractVersion: "1", requiredEvidenceTypes: ["windows-native-staging"] });
const expected = { version: dsh.version, commit: dsh.commit, sourceFingerprint: fingerprint };

assert.match(source, /preflightDeploymentManifest\(manifest, \{ version: dsh\.version, commit: dsh\.commit, sourceFingerprint: dsh\.fingerprint \}\)/);
assert.doesNotThrow(() => preflightDeploymentManifest(manifest, expected));
for (const invalid of [
  { version: expected.version, commit: expected.commit },
  { ...expected, sourceFingerprint: "b".repeat(64) },
  { version: expected.version, commit: expected.commit, fingerprint },
  { ...expected, commit: "0".repeat(40) },
]) assert.throws(() => preflightDeploymentManifest(manifest, invalid));
for (const mutation of [
  (value) => { delete value.dsh.sourceFingerprint; },
  (value) => { value.dsh.sourceFingerprint = "b".repeat(64); },
  (value) => { value.dsh = { version: expected.version, commit: expected.commit, fingerprint }; },
  (value) => { value.dsh = { ...value.dsh, fingerprint }; },
  (value) => { value.dsh = { ...value.dsh, unexpected: "x" }; },
  (value) => { value.dsh.sourceFingerprint = hash("modified-after-generation"); },
]) {
  const invalid = structuredClone(manifest); mutation(invalid); assert.throws(() => preflightDeploymentManifest(invalid, expected));
}
console.log(JSON.stringify({ result: "PASS", positiveMapping: "PASS", failClosedCaseCount: 10, failClosedPassCount: 10, failClosedFailureCount: 0 }));
