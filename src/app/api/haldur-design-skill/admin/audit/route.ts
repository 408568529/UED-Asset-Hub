import { NextResponse } from "next/server";
import { hasHaldurCapability } from "@/lib/haldurPermissions";
import { haldurDesignSkillGovernanceService } from "@/services/haldurDesignSkillGovernanceService";
export async function GET(request: Request) { if (!hasHaldurCapability(request, "haldur.admin")) return NextResponse.json({ code: "PERMISSION_DENIED", message: "你没有执行此操作的权限。" }, { status: 403 }); return NextResponse.json(await haldurDesignSkillGovernanceService.audit()); }
