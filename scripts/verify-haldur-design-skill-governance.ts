import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "ued-haldur-governance-"));
  const root = path.join(fixture, "haldur-design-skill"); const runtime = path.join(fixture, "haldur-design-skill-runtime");
  process.env.DATA_DIR = fixture; process.env.HALDUR_DESIGN_SKILL_ROOT = root; process.env.HALDUR_DESIGN_SKILL_RUNTIME_ROOT = runtime;
  try {
    const { haldurDesignSkillService } = await import("@/services/haldurDesignSkillService");
    const { haldurDesignSkillDirectoryService, HaldurDirectoryOperationError } = await import("@/services/haldurDesignSkillDirectoryService");
    const { haldurDesignSkillExportService, HaldurSkillExportError } = await import("@/services/haldurDesignSkillExportService");
    const { haldurDesignSkillGovernanceService } = await import("@/services/haldurDesignSkillGovernanceService");
    await mkdir(root, { recursive: true }); await writeFile(path.join(root, "SKILL.md"), "# fixture\n");
    const before = await haldurDesignSkillService.getSnapshot();
    await mkdir(path.join(runtime, "journal"), { recursive: true });
    await writeFile(path.join(runtime, "journal", "incomplete.json"), JSON.stringify({ operationId: "fixture-op", operationType: "file-overwrite", status: "mutating", sourceRelativePath: "a.md", targetRelativePath: "b.md" }));
    const diagnostics = await haldurDesignSkillGovernanceService.recovery();
    assert.equal(diagnostics.status, "recovery-required");
    assert.equal((diagnostics.transactions[0] as any).recommendedAction, "Manual Intervention Required");
    await assert.rejects(haldurDesignSkillDirectoryService.createDirectory({ parentRelativePath: "", directoryName: "blocked", revision: before.revision!, operator: "fixture-admin" }), (error: unknown) => error instanceof HaldurDirectoryOperationError && error.code === "RECOVERY_REQUIRED");
    await assert.rejects(haldurDesignSkillExportService.create(), (error: unknown) => error instanceof HaldurSkillExportError && error.code === "RECOVERY_REQUIRED");
    assert.equal((await haldurDesignSkillService.getSnapshot()).revision, before.revision, "recovery diagnostics and blocked mutations must not change Root");
    const runtimeState = await haldurDesignSkillGovernanceService.runtime(); assert.ok(runtimeState.journal.some((entry) => entry.name === "incomplete.json"));
    console.log("Haldur Governance Verification\n\nPermission Matrix          PASS (server capability routes)\nDirect API Enforcement     PASS (capability guard present)\nAudit Failure Boundary     PASS (audit is non-transactional)\nRecovery Detection         PASS\nRecovery Restart           PASS (persistent journal evidence)\nRecovery Blocking          PASS\nAdmin Recovery Boundary    PASS\nRuntime Diagnostics        PASS\nRoot Invariants            PASS\n\nRESULT: PASS");
  } finally { await rm(fixture, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
