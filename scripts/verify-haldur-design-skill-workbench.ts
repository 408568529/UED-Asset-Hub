import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main() {
  const [workbench, page, navigation, readRoute, queue] = await Promise.all([
    readFile("src/components/haldur/HaldurDesignSkillWorkbench.tsx", "utf8"),
    readFile("src/app/haldur-design-skill/page.tsx", "utf8"),
    readFile("src/config/modules.ts", "utf8"),
    readFile("src/app/api/haldur-design-skill/route.ts", "utf8"),
    readFile("src/components/haldur/HaldurUploadQueue.tsx", "utf8")
  ]);
  for (const value of ["/api/haldur-design-skill", "/api/haldur-design-skill/directories", "/api/haldur-design-skill/files", "REVISION_CONFLICT", "RECOVERY_REQUIRED", "Haldur-Design-Skill 当前不可用", "当前文件夹暂无内容", "x-haldur-overwrite", "window.location.assign"]) assert.ok((workbench + queue).includes(value), `Workbench must include ${value}`);
  assert.ok(!workbench.includes('const folders = ["micro-standard"'), "Workbench must not hard-code directory data");
  assert.ok(page.includes("HaldurDesignSkillWorkbench"));
  assert.ok(navigation.includes('name: "Haldur-Design-Skill", href: "/haldur-design-skill"'));
  assert.ok(readRoute.includes("recoveryRequired"), "Read contract must surface recovery state for the UI");
  console.log("[haldur] workbench navigation, dynamic API integration, conflict, recovery, root-unavailable, and no-hardcoded-directory verification passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
