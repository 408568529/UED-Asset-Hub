import { appendFile, readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { canonicalJson, sha256 } from "./release-artifact-tree.mjs";
import { exact, parseStrictJson } from "./release-json-contract.mjs";
import { loadProtectedHistoricalRoots } from "./release-approval-store.mjs";
import { loadWindowsExecutionSelection, constructWindowsRelease } from "./windows-release-constructor.mjs";
import { runSerialReleasePair, sealSerialReleaseOutput } from "./release-serial-runner.mjs";
// This is an execution command, not a dry-run command. It requires a separately published permission plan.
export async function runApprovedSerialRelease(packet) {
  exact(packet, ["a", "b", "observationJournal"], "serial execution packet");
  const items = [];
  for (const values of [packet.a, packet.b]) {
    const admitted = await loadWindowsExecutionSelection(values), bindingBytes = await readFile(values["execution-binding"]);
    items.push({ values, admission: admitted.admissionContext, approval: admitted.admissionContext.approval, authority: admitted.authority, plan: admitted.admissionContext.plan, binding: admitted.binding, bindingBytes, bindingSha256: sha256(bindingBytes), expected: { experimentId: admitted.binding.experimentId, executionRunId: admitted.binding.executionRunId, candidateLabel: admitted.binding.candidateLabel, inputAuthorityIdentity: admitted.authority.inputAuthorityIdentity, phase: admitted.binding.permission.expectedPhase, receipts: admitted.binding.receipts, bindings: admitted.binding.bindings, journal: admitted.phaseJournal } });
  }
  const path = await import("node:path");
  const rel = path.relative(items[0].binding.locators.evidenceRoot, packet.observationJournal);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Serial observation journal must be external execution evidence");
  const roots = await loadProtectedHistoricalRoots();
  let observationStarted = false;
  const observe = async (entry) => {
    if (!observationStarted) {
      await mkdir(path.dirname(packet.observationJournal), { recursive: true });
      await writeFile(packet.observationJournal, canonicalJson(entry) + "\n", { flag: "wx" });
      observationStarted = true;
    } else await appendFile(packet.observationJournal, canonicalJson(entry) + "\n");
  };
  return runSerialReleasePair({ a: items[0], b: items[1], approvedHistoryRoots: roots, execute: (item) => constructWindowsRelease(item.values), seal: sealSerialReleaseOutput, journal: observe });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error("Usage: node run-release-serial.mjs <operator-permitted serial packet.json>");
  process.stdout.write(canonicalJson(await runApprovedSerialRelease(parseStrictJson(await readFile(process.argv[2])))) + "\n");
}
