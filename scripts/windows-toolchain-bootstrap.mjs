import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { buildContract } from "./windows-release-constructor.mjs";
import { calculateCompleteByteTreeInventory } from "./release-byte-comparison.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export async function bootstrapWindowsToolchain({ runId, runStaging, sidecarPath, acquire, extract, run, authority, hash = async (file) => sha256(await readFile(file)) }) {
  if (!runId || !runStaging || !sidecarPath || !acquire || !extract || !run) throw new Error("Windows toolchain bootstrap inputs are incomplete.");
  if (!authority?.toolchain || authority.toolchain.nodeVersion !== buildContract.nodeVersion || authority.toolchain.npmVersion !== buildContract.npmVersion || authority.toolchain.architecture !== "x64" || !/^[a-f0-9]{64}$/u.test(authority.toolchain.npmCliSha256 || "") || !/^[a-f0-9]{64}$/u.test(authority.toolchain.npmDistributionSha256 || "")) throw new Error("approved complete toolchain authority is required.");
  const sidecarBytes = await readFile(sidecarPath); const sidecar = JSON.parse(sidecarBytes.toString("utf8"));
  if (sidecar.version !== buildContract.nodeVersion || sidecar.sha256 !== buildContract.nodeArtifactSha256 || sidecar.architecture !== "x64" || typeof sidecar.source !== "string" || !/^https:\/\//u.test(sidecar.source)) throw new Error("frozen Node sidecar is invalid.");
  const toolchainRoot = path.join(path.resolve(runStaging), "toolchain");
  const artifact = await acquire({ url: sidecar.source, destination: path.join(toolchainRoot, "node.zip"), runId });
  if (!artifact?.path || !/^[a-f0-9]{64}$/u.test(artifact.sha256 ?? "")) throw new Error("Node artifact acquisition evidence is invalid.");
  const nodeRoot = await extract({ archive: artifact.path, destination: path.join(toolchainRoot, "node-root"), runId });
  const nodeExecutable = path.join(nodeRoot, "node.exe"); const npmCli = path.join(nodeRoot, "node_modules", "npm", "bin", "npm-cli.js");
  await Promise.all([access(nodeExecutable), access(npmCli)]);
  const nodeSha256 = await hash(nodeExecutable);
  if (nodeSha256 !== sidecar.sha256) throw new Error("acquired node.exe SHA-256 mismatch.");
  if (nodeSha256 !== authority.toolchain.nodeSha256 || await hash(npmCli) !== authority.toolchain.npmCliSha256 || (await calculateCompleteByteTreeInventory(path.join(nodeRoot, "node_modules", "npm"))).sha256 !== authority.toolchain.npmDistributionSha256) throw new Error("acquired toolchain bytes do not match the approved distribution authority.");
  const nodeVersion = (await run(nodeExecutable, ["--version"])).trim(); const npmVersion = (await run(nodeExecutable, [npmCli, "--version"])).trim();
  if (nodeVersion !== `v${buildContract.nodeVersion}` || npmVersion !== buildContract.npmVersion) throw new Error("acquired Node/npm version mismatch.");
  return { runId, nodeRoot, nodeExecutable, npmCli, nodeVersion, npmVersion, nodeSha256, artifactSha256: artifact.sha256, sidecarSha256: sha256(sidecarBytes), acquisitionEvidence: artifact.evidence ?? null };
}
