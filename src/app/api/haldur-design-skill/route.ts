import path from "node:path";
import { NextResponse } from "next/server";
import { getHaldurDesignSkillConfig } from "@/config/haldurDesignSkill";
import { hasHaldurCapability } from "@/lib/haldurPermissions";
import { hasHaldurRecoveryRequired } from "@/services/haldurDesignSkillDirectoryService";
import { haldurDesignSkillService } from "@/services/haldurDesignSkillService";

export async function GET(request: Request) {
  if (!hasHaldurCapability(request, "haldur.read")) return NextResponse.json({ code: "PERMISSION_DENIED", message: "你没有执行此操作的权限。" }, { status: 403 });
  const snapshot = await haldurDesignSkillService.getSnapshot();
  if (snapshot.rootAvailable) {
    try {
      const { runtimeRoot } = getHaldurDesignSkillConfig();
      snapshot.recoveryRequired = await hasHaldurRecoveryRequired(runtimeRoot);
      if (hasHaldurCapability(request, "haldur.admin")) snapshot.trashDirectory = path.join(runtimeRoot, "trash");
    } catch {
      snapshot.recoveryRequired = false;
    }
  }
  return NextResponse.json(snapshot, { status: snapshot.rootAvailable ? 200 : 503, headers: { "Cache-Control": "private, no-store" } });
}
